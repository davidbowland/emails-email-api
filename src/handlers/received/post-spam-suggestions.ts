import { simpleParser } from 'mailparser'

import { assertRequiredEnv, spamSuggestionDailyLimit } from '../../config'
import { converse } from '../../services/bedrock'
import {
  getAccountById,
  getReceivedById,
  incrementSpamSuggestionUsage,
  refundSpamSuggestionUsage,
} from '../../services/dynamodb'
import { getS3Object } from '../../services/s3'
import { Account, APIGatewayProxyEventV2, APIGatewayProxyResultV2, EmailContents } from '../../types'
import { validateUsernameInEvent } from '../../utils/events'
import { log, logError, logWarn, redactEvent } from '../../utils/logging'
import { convertParsedContentsToEmail } from '../../utils/parser'
import { buildSuggestionRequest, extractSuggestionToolInput, validateSuggestions } from '../../utils/spam-suggestions'
import status from '../../utils/status'

assertRequiredEnv(
  'BEDROCK_MODEL_ID',
  'DYNAMODB_ACCOUNTS_TABLE_NAME',
  'DYNAMODB_RECEIVED_TABLE_NAME',
  'EMAIL_BUCKET',
  'SPAM_SUGGESTION_DAILY_LIMIT',
  'SPAM_SUGGESTION_USAGE_TABLE_NAME',
)

// Bedrock states that are expected and temporary, answered 503 so the UI shows a non-blocking "try
// later" rather than an error. ThrottlingException is Bedrock shedding load; ServiceUnavailable,
// ModelNotReady and ModelTimeout are the model side being down, cold or slow; TimeoutError is the SDK
// giving up on the request timeout set in services/bedrock.ts. AccessDeniedException is what the
// fleet's kill-switch-bedrock managed policy produces when it is flipped.
const BEDROCK_UNAVAILABLE_ERRORS = new Set([
  'AccessDeniedException',
  'ModelNotReadyException',
  'ModelTimeoutException',
  'ServiceUnavailableException',
  'ThrottlingException',
  'TimeoutError',
])

// Matches the errors getReceivedById and getAccountById throw when the item does not exist; anything
// else (throttling, permissions, a malformed item) is a failure on our side, not a missing email.
const NOT_FOUND_MESSAGES = new Set(['Account not found', 'Email not found'])

interface HandlerResult {
  body: string
  statusCode: number
}

const DAILY_LIMIT_RESPONSE: HandlerResult = {
  ...status.TOO_MANY_REQUESTS,
  body: JSON.stringify({ code: 'DAILY_LIMIT', message: 'Daily suggestion limit reached' }),
}

// Errors are logged by name only: SDK and parser messages can quote the request or the email.
const errorName = (error: unknown): string | undefined => (error as Error)?.name

const isNotFound = (error: unknown): boolean => error instanceof Error && NOT_FOUND_MESSAGES.has(error.message)

// An email (or account) that does not exist is answered 404, as get-contents.ts does; any other failure
// is rethrown and answered 500.
const getAccountAndEmail = async (accountId: string, emailId: string): Promise<Account | undefined> => {
  try {
    await getReceivedById(accountId, emailId)
    return await getAccountById(accountId)
  } catch (error: unknown) {
    if (isNotFound(error)) {
      return undefined
    }
    throw error
  }
}

const getEmailContents = async (accountId: string, emailId: string): Promise<EmailContents | undefined> => {
  try {
    const { body } = await getS3Object(`received/${accountId}/${emailId}`)
    return convertParsedContentsToEmail(emailId, await simpleParser(body))
  } catch (error) {
    logError('Unable to read email contents', { accountId, error: errorName(error), messageId: emailId })
    return undefined
  }
}

// convertParsedContentsToEmail already substitutes empty addresses and an empty body when the email
// has none, so only the subject can be missing here.
const toSuggestionEmail = (contents: EmailContents) => ({
  from: contents.fromAddress.text,
  replyTo: contents.replyToAddress.value
    .map(({ address }) => address)
    .filter(Boolean)
    .join(', '),
  subject: contents.subject ?? '',
  text: contents.bodyText,
})

// The kill switch is a deliberate operator action, so it is a warning; the other states are routine.
const logBedrockUnavailable = (accountId: string, emailId: string, error: unknown): void => {
  const write = errorName(error) === 'AccessDeniedException' ? logWarn : log
  write('Bedrock unavailable', { accountId, error: errorName(error), messageId: emailId })
}

// Everything after the quota is counted. Never throws: every failure becomes a 500 or 503 result, so
// the caller can refund the count.
const generateSuggestions = async (account: Account, accountId: string, emailId: string): Promise<HandlerResult> => {
  try {
    const contents = await getEmailContents(accountId, emailId)
    if (contents === undefined) {
      return status.INTERNAL_SERVER_ERROR
    }
    const email = toSuggestionEmail(contents)

    const command = buildSuggestionRequest(account, email)
    const response = await converse(command).catch((error: unknown) => {
      if (BEDROCK_UNAVAILABLE_ERRORS.has(errorName(error) as string)) {
        logBedrockUnavailable(accountId, emailId, error)
        return undefined
      }
      throw error
    })
    if (response === undefined) {
      return status.SERVICE_UNAVAILABLE
    }

    const suggestions = validateSuggestions(extractSuggestionToolInput(response), account, email)
    log('Spam suggestions generated', {
      accountId,
      count: suggestions.length,
      messageId: emailId,
      model: command.input.modelId,
    })
    return { ...status.OK, body: JSON.stringify({ suggestions }) }
  } catch (error) {
    logError('Spam suggestions failed', { accountId, error: errorName(error), messageId: emailId })
    return status.INTERNAL_SERVER_ERROR
  }
}

// A request that failed on our side gives its use back, so an outage does not spend the daily limit.
// A failed refund only costs the account one use, so it is a warning and never changes the response.
const refundUsage = async (accountId: string, emailId: string, now: () => number): Promise<void> => {
  try {
    await refundSpamSuggestionUsage(accountId, now)
  } catch (error) {
    logWarn('Unable to refund spam suggestion usage', { accountId, error: errorName(error), messageId: emailId })
  }
}

export const postSpamSuggestionsHandler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', redactEvent(event))
  const accountId = event.pathParameters?.accountId as string
  const emailId = event.pathParameters?.emailId as string
  // One clock for the increment and any refund, so a request straddling UTC midnight refunds the day
  // it was counted against.
  const requestedAt = Date.now()
  const now = (): number => requestedAt
  try {
    if (!validateUsernameInEvent(event, accountId)) {
      return status.FORBIDDEN
    }

    const account = await getAccountAndEmail(accountId, emailId)
    if (account === undefined) {
      return status.NOT_FOUND
    }

    if (!(await incrementSpamSuggestionUsage(accountId, spamSuggestionDailyLimit, now))) {
      log('Spam suggestion daily limit reached', { accountId, messageId: emailId })
      return DAILY_LIMIT_RESPONSE
    }

    const result = await generateSuggestions(account, accountId, emailId)
    if (result.statusCode >= 500) {
      await refundUsage(accountId, emailId, now)
    }
    return result
  } catch (error) {
    logError('Spam suggestions failed', { accountId, error: errorName(error), messageId: emailId })
    return status.INTERNAL_SERVER_ERROR
  }
}
