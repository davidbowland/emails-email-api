import { simpleParser } from 'mailparser'

import { assertRequiredEnv } from '../config'
import { getAllReceived } from '../services/dynamodb'
import { getS3ObjectStart } from '../services/s3'
import {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  EmailBatch,
  SpamEmailImpactResult,
  SpamImpactDependencies,
  SpamImpactRequest,
} from '../types'
import { validateUsernameInEvent } from '../utils/events'
import { log, logError, redactEvent } from '../utils/logging'
import { toWords } from '../utils/phrase-matching'
import {
  buildImpactResponse,
  countByFolder,
  countFailedReasons,
  isMissingObjectError,
  matchesPhrases,
  parseImpactRequest,
  selectEmailsToCheck,
  SPAM_IMPACT_BYTE_LIMIT,
  SPAM_IMPACT_CONCURRENCY,
  SPAM_IMPACT_DEADLINE_MS,
  SPAM_IMPACT_READ_TIMEOUT_MS,
  toLoggableErrorName,
} from '../utils/spam-impact'
import { isSpamImpactDeadlineError } from '../utils/spam-impact-errors'
import status from '../utils/status'

assertRequiredEnv('DYNAMODB_RECEIVED_TABLE_NAME', 'EMAIL_BUCKET')

const CHECK_TIMEOUT_RESPONSE = { ...status.SERVICE_UNAVAILABLE, body: JSON.stringify({ code: 'CHECK_TIMEOUT' }) }

// matched: read and matched against every phrase. missing: the raw file does not exist, so there is nothing to check.
// failed: anything else went wrong; errorName is safe to log (see toLoggableErrorName).
type ReadOutcome =
  | { email: EmailBatch; matches: boolean[]; status: 'matched' }
  | { email: EmailBatch; status: 'missing' }
  | { email: EmailBatch; errorName: string; status: 'failed' }

interface ReadProgress {
  attempted: ReadOutcome[]
  notAttempted: EmailBatch[]
}

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

// Only the per-phrase booleans are kept; the parsed email is dropped as soon as it has been matched. A missing raw
// file, a failed read or a failed parse is an outcome, never an exception.
const readEmail = async (
  accountId: string,
  email: EmailBatch,
  phraseWords: string[][],
  timeLeft: () => number,
  { createAbortSignal }: SpamImpactDependencies,
): Promise<ReadOutcome> => {
  try {
    const abortSignal = createAbortSignal(Math.max(0, Math.min(SPAM_IMPACT_READ_TIMEOUT_MS, timeLeft())))
    const raw = await getS3ObjectStart(`received/${accountId}/${email.id}`, SPAM_IMPACT_BYTE_LIMIT, abortSignal)
    return { email, matches: matchesPhrases(await simpleParser(raw), phraseWords), status: 'matched' }
  } catch (error: unknown) {
    return isMissingObjectError(error)
      ? { email, status: 'missing' }
      : { email, errorName: toLoggableErrorName(error), status: 'failed' }
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
  dependencies: SpamImpactDependencies,
): Promise<APIGatewayProxyResultV2<any>> => {
  const { clock, createAbortSignal } = dependencies
  const deadline = requestedAt + SPAM_IMPACT_DEADLINE_MS
  const timeLeft = (): number => deadline - clock()
  const isBeforeDeadline = (): boolean => timeLeft() > 0
  const emails = await getAllReceived(accountId, timeLeft, createAbortSignal)
  const { readOrder, totals } = selectEmailsToCheck(emails, request.excludeEmailId)

  const phraseWords = request.phrases.map(toWords)
  const { attempted, notAttempted } = await readInBatches(
    readOrder,
    (email) => readEmail(accountId, email, phraseWords, timeLeft, dependencies),
    isBeforeDeadline,
  )
  const results: SpamEmailImpactResult[] = attempted.flatMap((outcome) =>
    outcome.status === 'matched' ? [{ email: outcome.email, matches: outcome.matches }] : [],
  )
  const failedReads = attempted.flatMap((outcome) => (outcome.status === 'failed' ? [outcome] : []))
  const failed = countByFolder(failedReads.map(({ email }) => email))
  const missing = countByFolder(attempted.filter((outcome) => outcome.status === 'missing').map(({ email }) => email))
  const notAttemptedCounts = countByFolder(notAttempted)

  const response = buildImpactResponse(request.phrases, results, {
    failed,
    missing,
    notAttempted: notAttemptedCounts,
    totals,
  })
  // Counts and error names only: never a key, an email id, a subject, a phrase or an error message.
  log('Spam impact check finished', {
    accountId,
    deadlineReached: notAttempted.length > 0,
    durationMs: clock() - requestedAt,
    failed,
    failedReasons: countFailedReasons(failedReads.map(({ errorName }) => errorName)),
    inboxChecked: response.checked.inbox.checked,
    missing,
    notAttempted: notAttemptedCounts,
    phraseCount: request.phrases.length,
    spamChecked: response.checked.spam.checked,
  })
  return { ...status.OK, body: JSON.stringify(response) }
}

// Lambda passes three positional arguments (event, context, callback), so the handler takes only the event and its
// dependencies come from the factory.
export const createPostSpamImpactHandler =
  (dependencies: SpamImpactDependencies) =>
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<any>> => {
    log('Received event', redactEvent(event))
    const accountId = event.pathParameters?.accountId as string
    try {
      const requestedAt = dependencies.clock()
      if (!validateUsernameInEvent(event, accountId)) {
        return status.FORBIDDEN
      }

      const parsed = parseRequest(event)
      if ('badRequest' in parsed) {
        return parsed.badRequest
      }

      return await checkImpact(accountId, parsed.request, requestedAt, dependencies)
    } catch (error) {
      if (isSpamImpactDeadlineError(error)) {
        log('Spam impact check ran out of time loading emails', { accountId })
        return CHECK_TIMEOUT_RESPONSE
      }
      // By name only, with the same check as failedReasons: SDK and parser messages can quote the request
      logError('Spam impact check failed', { accountId, error: toLoggableErrorName(error) })
      return status.INTERNAL_SERVER_ERROR
    }
  }

export const postSpamImpactHandler = createPostSpamImpactHandler({
  clock: Date.now,
  createAbortSignal: (ms) => AbortSignal.timeout(ms),
})
