import { simpleParser } from 'mailparser'

import { assertRequiredEnv, spamSuggestionDailyLimit } from '../../config'
import { converse } from '../../services/bedrock'
import { getAccountById, getReceivedById, incrementSpamSuggestionUsage } from '../../services/dynamodb'
import { getS3Object } from '../../services/s3'
import { Account, APIGatewayProxyEventV2, APIGatewayProxyResultV2, EmailContents } from '../../types'
import { validateUsernameInEvent } from '../../utils/events'
import { log, logError, redactEvent } from '../../utils/logging'
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

// AccessDeniedException is what the fleet's kill-switch-bedrock managed policy produces when it is
// flipped; ThrottlingException is Bedrock shedding load. Both are expected, temporary states and the
// UI treats 503 as a non-blocking "try later", so neither is an error worth paging on.
const BEDROCK_UNAVAILABLE_ERRORS = new Set(['AccessDeniedException', 'ThrottlingException'])

// Errors are logged by name only: SDK and parser messages can quote the request or the email.
const errorName = (error: unknown): string | undefined => (error as Error)?.name

// Mirrors get-contents.ts: an email (or account) that cannot be read is answered 404.
const getAccountAndEmail = async (accountId: string, emailId: string): Promise<Account | undefined> => {
  try {
    await getReceivedById(accountId, emailId)
    return await getAccountById(accountId)
  } catch {
    return undefined
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

export const postSpamSuggestionsHandler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', redactEvent(event))
  const accountId = event.pathParameters?.accountId as string
  const emailId = event.pathParameters?.emailId as string
  try {
    if (!validateUsernameInEvent(event, accountId)) {
      return status.FORBIDDEN
    }

    const account = await getAccountAndEmail(accountId, emailId)
    if (account === undefined) {
      return status.NOT_FOUND
    }

    if (!(await incrementSpamSuggestionUsage(accountId, spamSuggestionDailyLimit))) {
      log('Spam suggestion daily limit reached', { accountId, messageId: emailId })
      return status.TOO_MANY_REQUESTS
    }

    const contents = await getEmailContents(accountId, emailId)
    if (contents === undefined) {
      return status.INTERNAL_SERVER_ERROR
    }
    const email = toSuggestionEmail(contents)

    const command = buildSuggestionRequest(account, email)
    const response = await converse(command).catch((error: unknown) => {
      if (BEDROCK_UNAVAILABLE_ERRORS.has(errorName(error) as string)) {
        log('Bedrock unavailable', { accountId, error: errorName(error), messageId: emailId })
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
