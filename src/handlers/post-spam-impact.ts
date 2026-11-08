import { simpleParser } from 'mailparser'

import { assertRequiredEnv } from '../config'
import { getAllReceived } from '../services/dynamodb'
import { getS3ObjectStart } from '../services/s3'
import {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  EmailBatch,
  SpamEmailImpactResult,
  SpamImpactRequest,
} from '../types'
import { validateUsernameInEvent } from '../utils/events'
import { log, logError, redactEvent } from '../utils/logging'
import { toWords } from '../utils/phrase-matching'
import {
  buildImpactResponse,
  countByFolder,
  matchesPhrases,
  parseImpactRequest,
  selectEmailsToCheck,
  SPAM_IMPACT_BYTE_LIMIT,
  SPAM_IMPACT_CONCURRENCY,
  SPAM_IMPACT_DEADLINE_MS,
  SPAM_IMPACT_READ_TIMEOUT_MS,
} from '../utils/spam-impact'
import { isSpamImpactDeadlineError } from '../utils/spam-impact-errors'
import status from '../utils/status'

assertRequiredEnv('DYNAMODB_RECEIVED_TABLE_NAME', 'EMAIL_BUCKET')

const CHECK_TIMEOUT_RESPONSE = { ...status.SERVICE_UNAVAILABLE, body: JSON.stringify({ code: 'CHECK_TIMEOUT' }) }

interface ReadOutcome {
  email: EmailBatch
  matches?: boolean[]
}

interface ReadProgress {
  attempted: ReadOutcome[]
  notAttempted: EmailBatch[]
}

// Errors are logged by name only: SDK and parser messages can quote the request or the email.
const errorName = (error: unknown): string | undefined => (error as Error)?.name

const getRequestBody = (event: APIGatewayProxyEventV2): string | undefined =>
  event.isBase64Encoded && event.body ? Buffer.from(event.body, 'base64').toString('utf8') : event.body

// parseImpactRequest's messages never quote a phrase, so they are safe to answer with.
const parseRequest = (
  event: APIGatewayProxyEventV2,
): { badRequest: APIGatewayProxyResultV2<any> } | { request: SpamImpactRequest } => {
  try {
    return { request: parseImpactRequest(getRequestBody(event)) }
  } catch (error: unknown) {
    return { badRequest: { ...status.BAD_REQUEST, body: JSON.stringify({ message: (error as Error).message }) } }
  }
}

// Only the per-phrase booleans are kept; the parsed email is dropped as soon as it has been matched. A failed read or
// parse is an outcome with no matches, never an exception.
const readEmail = async (
  accountId: string,
  email: EmailBatch,
  phraseWords: string[][],
  timeLeft: () => number,
): Promise<ReadOutcome> => {
  try {
    const abortSignal = AbortSignal.timeout(Math.max(0, Math.min(SPAM_IMPACT_READ_TIMEOUT_MS, timeLeft())))
    const raw = await getS3ObjectStart(`received/${accountId}/${email.id}`, SPAM_IMPACT_BYTE_LIMIT, abortSignal)
    return { email, matches: matchesPhrases(await simpleParser(raw), phraseWords) }
  } catch {
    return { email }
  }
}

// Works through the read order a batch at a time, and starts no batch once the deadline has passed.
const readInBatches = async (
  remaining: EmailBatch[],
  read: (email: EmailBatch) => Promise<ReadOutcome>,
  isBeforeDeadline: () => boolean,
  attempted: ReadOutcome[] = [],
): Promise<ReadProgress> => {
  if (remaining.length === 0 || !isBeforeDeadline()) {
    return { attempted, notAttempted: remaining }
  }
  const outcomes = await Promise.all(remaining.slice(0, SPAM_IMPACT_CONCURRENCY).map(read))
  return readInBatches(remaining.slice(SPAM_IMPACT_CONCURRENCY), read, isBeforeDeadline, [...attempted, ...outcomes])
}

const checkImpact = async (
  accountId: string,
  request: SpamImpactRequest,
  requestedAt: number,
  clock: () => number,
): Promise<APIGatewayProxyResultV2<any>> => {
  const deadline = requestedAt + SPAM_IMPACT_DEADLINE_MS
  const timeLeft = (): number => deadline - clock()
  const isBeforeDeadline = (): boolean => timeLeft() > 0
  const emails = await getAllReceived(accountId, timeLeft)
  const { readOrder, totals } = selectEmailsToCheck(emails, request.excludeEmailId)

  const phraseWords = request.phrases.map(toWords)
  const { attempted, notAttempted } = await readInBatches(
    readOrder,
    (email) => readEmail(accountId, email, phraseWords, timeLeft),
    isBeforeDeadline,
  )
  const results = attempted.filter((outcome): outcome is SpamEmailImpactResult => outcome.matches !== undefined)
  const failed = countByFolder(attempted.filter(({ matches }) => matches === undefined).map(({ email }) => email))
  const notAttemptedCounts = countByFolder(notAttempted)

  const response = buildImpactResponse(request.phrases, results, totals, failed, notAttemptedCounts)
  log('Spam impact check finished', {
    accountId,
    deadlineReached: notAttempted.length > 0,
    durationMs: clock() - requestedAt,
    failed,
    inboxChecked: response.checked.inbox.checked,
    notAttempted: notAttemptedCounts,
    phraseCount: request.phrases.length,
    spamChecked: response.checked.spam.checked,
  })
  return { ...status.OK, body: JSON.stringify(response) }
}

export const postSpamImpactHandler = async (
  event: APIGatewayProxyEventV2,
  clock: () => number = Date.now,
): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', redactEvent(event))
  const requestedAt = clock()
  const accountId = event.pathParameters?.accountId as string
  try {
    if (!validateUsernameInEvent(event, accountId)) {
      return status.FORBIDDEN
    }

    const parsed = parseRequest(event)
    if ('badRequest' in parsed) {
      return parsed.badRequest
    }

    return await checkImpact(accountId, parsed.request, requestedAt, clock)
  } catch (error) {
    if (isSpamImpactDeadlineError(error)) {
      log('Spam impact check ran out of time loading emails', { accountId })
      return CHECK_TIMEOUT_RESPONSE
    }
    logError('Spam impact check failed', { accountId, error: errorName(error) })
    return status.INTERNAL_SERVER_ERROR
  }
}
