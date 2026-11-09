import * as mailparser from 'mailparser'

import eventJson from '@events/post-spam-impact.json'
import { createPostSpamImpactHandler, postSpamImpactHandler } from '@handlers/post-spam-impact'
import * as dynamodb from '@services/dynamodb'
import * as s3 from '@services/s3'
import { APIGatewayProxyEventV2, Context, EmailBatch, EmailFolder, ParsedMail } from '@types'
import * as events from '@utils/events'
import { log, logError, logWarn, redactEvent } from '@utils/logging'
import { createSpamImpactDeadlineError } from '@utils/spam-impact-errors'
import status from '@utils/status'

jest.mock('mailparser')
jest.mock('@services/dynamodb')
jest.mock('@services/s3')
// isValidBlockPhrase stays real: parseImpactRequest applies the account save rules through it.
jest.mock('@utils/events', () => ({
  ...jest.requireActual('@utils/events'),
  validateUsernameInEvent: jest.fn(),
}))
jest.mock('@utils/logging')

describe('post-spam-impact', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2
  const accountId = 'account'
  const excludeEmailId = '7yh8g-7ytguy-98ui8u-5efka-87y87y'
  const requestedAt = 1_800_000_000_000

  const makeEmail = (id: string, timestamp: number, folder: EmailFolder): EmailBatch => ({
    accountId,
    data: { folder, from: `${id}@domain.com`, subject: `Subject ${id}`, timestamp, to: [], viewed: false },
    id,
  })
  const inboxBody = makeEmail('inbox-body', 30, 'inbox')
  const inboxHtml = makeEmail('inbox-html', 20, 'inbox')
  const inboxNone = makeEmail('inbox-none', 10, 'inbox')
  const spamHtml = makeEmail('spam-html', 5, 'spam')
  const excluded = makeEmail(excludeEmailId, 40, 'inbox')
  const emails = [inboxNone, spamHtml, inboxBody, excluded, inboxHtml]

  // Each read returns the S3 key as the raw email, and the parser looks the key up here.
  const parsedByKey: Record<string, Partial<ParsedMail>> = {
    [`received/${accountId}/inbox-body`]: { subject: 'Hello', text: 'Claim your free money today' },
    [`received/${accountId}/inbox-html`]: { html: '<p>A <b>limited time offer</b></p>', subject: 'News' },
    [`received/${accountId}/inbox-none`]: { subject: 'Lunch', text: 'See you at noon' },
    [`received/${accountId}/spam-html`]: { html: '<p>free money</p>', subject: 'Win', text: 'stub' },
    [`received/${accountId}/${excludeEmailId}`]: { subject: 'free money limited time offer' },
  }

  // Emails with no entry above read as a plain email that matches nothing
  const parseByKey = (async (body: Buffer) =>
    (parsedByKey[body.toString()] ?? { subject: 'Hello', text: 'safe' }) as ParsedMail) as any
  const fixedClock = () => jest.fn().mockReturnValue(requestedAt)
  // Never aborts and starts no timer, so no test depends on a real timeout
  const unabortedSignal = () => new AbortController().signal
  const s3Error = (name: string, httpStatusCode: number, message = 'S3 error') =>
    Object.assign(new Error(message), { $metadata: { httpStatusCode }, name })
  // A read of an email in errorsById fails with that error; every other read returns its S3 key as the raw email
  const readWithErrors =
    (errorsById: Record<string, Error>) =>
    async (key: string): Promise<Buffer> => {
      const id = key.slice(`received/${accountId}/`.length)
      return Object.hasOwn(errorsById, id) ? Promise.reject(errorsById[id]) : Buffer.from(key)
    }
  // Installs one keyed read implementation for a single handler run, whatever its read count, and puts the default
  // back afterwards, even if the run throws, so no failure reaches the next test.
  const runWithReadErrors = async (errorsById: Record<string, Error>) => {
    jest.mocked(s3).getS3ObjectStart.mockImplementation(readWithErrors(errorsById))
    try {
      return await createHandler(fixedClock())(event)
    } finally {
      jest.mocked(s3).getS3ObjectStart.mockImplementation(readWithErrors({}))
    }
  }
  const createHandler = (clock: () => number, createAbortSignal: (ms: number) => AbortSignal = unabortedSignal) =>
    createPostSpamImpactHandler({ clock, createAbortSignal })

  beforeAll(() => {
    jest.mocked(dynamodb).getAllReceived.mockResolvedValue(emails)
    jest.mocked(events).validateUsernameInEvent.mockReturnValue(true)
    jest.mocked(s3).getS3ObjectStart.mockImplementation(readWithErrors({}))
    jest.mocked(mailparser).simpleParser.mockImplementation(parseByKey)
    jest.mocked(redactEvent).mockReturnValue({ redacted: true })
  })

  describe('createPostSpamImpactHandler', () => {
    test("expect FORBIDDEN when user name doesn't match", async () => {
      jest.mocked(events).validateUsernameInEvent.mockReturnValueOnce(false)
      const result = await createHandler(fixedClock())(event)

      expect(result).toEqual(status.FORBIDDEN)
      expect(dynamodb.getAllReceived).not.toHaveBeenCalled()
    })

    test.each([
      ['no body', undefined],
      ['invalid JSON', '{'],
      ['no phrases', JSON.stringify({ phrases: [] })],
      ['a phrase with no letter or digit', JSON.stringify({ phrases: ['!!!'] })],
    ])('expect BAD_REQUEST for %s', async (_, body) => {
      const result = await createHandler(fixedClock())({ ...event, body })

      expect(result).toEqual(expect.objectContaining({ statusCode: 400 }))
      expect(JSON.parse(result.body).message).toEqual(expect.any(String))
      expect(dynamodb.getAllReceived).not.toHaveBeenCalled()
    })

    test('expect OK with every phrase checked against the newest emails', async () => {
      const result = await createHandler(fixedClock())(event)

      expect(result.statusCode).toEqual(200)
      expect(JSON.parse(result.body)).toEqual({
        checked: { inbox: { checked: 3, total: 3 }, spam: { checked: 1, total: 1 } },
        inboxIncomplete: false,
        phrases: [
          {
            inbox: {
              count: 1,
              emails: [{ from: 'inbox-body@domain.com', id: 'inbox-body', subject: 'Subject inbox-body' }],
            },
            phrase: 'free money',
            spam: {
              count: 1,
              emails: [{ from: 'spam-html@domain.com', id: 'spam-html', subject: 'Subject spam-html' }],
            },
          },
          {
            inbox: {
              count: 1,
              emails: [{ from: 'inbox-html@domain.com', id: 'inbox-html', subject: 'Subject inbox-html' }],
            },
            phrase: 'limited time offer',
            spam: { count: 0, emails: [] },
          },
        ],
      })
    })

    test('expect each read to request the first 256 KB with an abort signal, and never the excluded email', async () => {
      await createHandler(fixedClock())(event)

      expect(jest.mocked(s3).getS3ObjectStart.mock.calls.map(([key]) => key)).toEqual([
        `received/${accountId}/inbox-body`,
        `received/${accountId}/inbox-html`,
        `received/${accountId}/inbox-none`,
        `received/${accountId}/spam-html`,
      ])
      expect(s3.getS3ObjectStart).toHaveBeenCalledWith(expect.any(String), 262_144, expect.any(AbortSignal))
    })

    test('expect getAllReceived to be given the time left before the deadline', async () => {
      const clock = fixedClock()
      await createHandler(clock)(event)
      const timeLeft = jest.mocked(dynamodb).getAllReceived.mock.calls[0][1]

      expect(dynamodb.getAllReceived).toHaveBeenCalledWith(accountId, expect.any(Function), unabortedSignal)
      expect(timeLeft()).toEqual(20_000)
      clock.mockReturnValue(requestedAt + 20_000)
      expect(timeLeft()).toEqual(0)
    })

    test('expect each read to get a 3000 ms signal when plenty of time is left, and that signal to reach S3', async () => {
      const signal = new AbortController().signal
      const createAbortSignal = jest.fn().mockReturnValue(signal)
      await createHandler(fixedClock(), createAbortSignal)(event)

      expect(createAbortSignal).toHaveBeenCalledTimes(4)
      expect(createAbortSignal).toHaveBeenCalledWith(3_000)
      expect(createAbortSignal.mock.calls.every(([ms]) => ms === 3_000)).toBe(true)
      expect(s3.getS3ObjectStart).toHaveBeenCalledTimes(4)
      expect(jest.mocked(s3).getS3ObjectStart.mock.calls.every(([, , abortSignal]) => abortSignal === signal)).toBe(
        true,
      )
    })

    test('expect a read to get a signal for the time left when less than 3 seconds remain', async () => {
      const createAbortSignal = jest.fn(unabortedSignal)
      const clock = jest
        .fn()
        .mockReturnValue(requestedAt + 18_500)
        .mockReturnValueOnce(requestedAt)
      await createHandler(clock, createAbortSignal)(event)

      expect(createAbortSignal).toHaveBeenCalledWith(1_500)
      expect(createAbortSignal).not.toHaveBeenCalledWith(3_000)
    })

    test('expect getAllReceived to be given the same abort-signal factory', async () => {
      const createAbortSignal = jest.fn(unabortedSignal)
      await createHandler(fixedClock(), createAbortSignal)(event)

      expect(dynamodb.getAllReceived).toHaveBeenCalledWith(accountId, expect.any(Function), createAbortSignal)
    })

    test('expect a base64-encoded body to be decoded', async () => {
      const body = Buffer.from(JSON.stringify({ phrases: ['free money'] })).toString('base64')
      const result = await createHandler(fixedClock())({ ...event, body, isBase64Encoded: true })

      expect(result.statusCode).toEqual(200)
      expect(JSON.parse(result.body).phrases.map(({ phrase }) => phrase)).toEqual(['free money'])
    })

    test('stops starting batches after the deadline', async () => {
      const inbox = Array.from({ length: 30 }, (_, index) => makeEmail(`many-${index}`, 1_000 - index, 'inbox'))
      jest.mocked(dynamodb).getAllReceived.mockResolvedValueOnce(inbox)
      const clock = fixedClock()
      // The first read moves the live clock past requestedAt + 20_000, so no second batch starts
      jest.mocked(s3).getS3ObjectStart.mockImplementationOnce(async (key) => {
        clock.mockReturnValue(requestedAt + 20_001)
        return Buffer.from(key)
      })
      const result = await createHandler(clock)(event)
      const body = JSON.parse(result.body)

      expect(result.statusCode).toEqual(200)
      expect(body.checked.inbox.checked).toBeLessThanOrEqual(10)
      expect(body.checked.inbox).toEqual({ checked: 10, total: 30 })
      expect(body.inboxIncomplete).toBe(true)
      expect(s3.getS3ObjectStart).toHaveBeenCalledTimes(10)
      expect(log).toHaveBeenCalledWith(
        'Spam impact check finished',
        expect.objectContaining({ deadlineReached: true, notAttempted: { inbox: 20, spam: 0 } }),
      )
    })

    test('counts an AccessDenied read as failed, making the check incomplete', async () => {
      jest.mocked(s3).getS3ObjectStart.mockRejectedValueOnce(s3Error('AccessDenied', 403))
      const result = await createHandler(fixedClock())(event)
      const body = JSON.parse(result.body)

      expect(result.statusCode).toEqual(200)
      expect(body.checked).toEqual({ inbox: { checked: 2, total: 3 }, spam: { checked: 1, total: 1 } })
      expect(body.inboxIncomplete).toBe(true)
      expect(logError).not.toHaveBeenCalled()
    })

    test('leaves an email whose raw file is missing out of the counts, without making the check incomplete', async () => {
      jest.mocked(s3).getS3ObjectStart.mockRejectedValueOnce(s3Error('NoSuchKey', 404))
      const result = await createHandler(fixedClock())(event)
      const body = JSON.parse(result.body)

      expect(result.statusCode).toEqual(200)
      expect(body.checked).toEqual({ inbox: { checked: 2, total: 2 }, spam: { checked: 1, total: 1 } })
      expect(body.inboxIncomplete).toBe(false)
      expect(logError).not.toHaveBeenCalled()
    })

    test('expect 5 missing Inbox emails and 20 read ones to give 20 of 20 and a complete check', async () => {
      const inbox = Array.from({ length: 25 }, (_, index) => makeEmail(`staging-${index}`, 1_000 - index, 'inbox'))
      jest.mocked(dynamodb).getAllReceived.mockResolvedValueOnce(inbox)
      // The 5 oldest, as on staging, whose DynamoDB records outlived their raw files
      const result = await runWithReadErrors(
        Object.fromEntries(inbox.slice(20).map(({ id }) => [id, s3Error('NoSuchKey', 404)])),
      )
      const body = JSON.parse(result.body)

      expect(body.checked).toEqual({ inbox: { checked: 20, total: 20 }, spam: { checked: 0, total: 0 } })
      expect(body.inboxIncomplete).toBe(false)
      expect(log).toHaveBeenCalledWith(
        'Spam impact check finished',
        expect.objectContaining({ failed: { inbox: 0, spam: 0 }, failedReasons: {}, missing: { inbox: 5, spam: 0 } }),
      )
    })

    test('expect a mix of missing and failed reads to count each, and to make the check incomplete', async () => {
      const result = await runWithReadErrors({
        'inbox-body': s3Error('NoSuchKey', 404),
        'inbox-html': s3Error('AccessDenied', 403),
      })
      const body = JSON.parse(result.body)

      expect(body.checked).toEqual({ inbox: { checked: 1, total: 2 }, spam: { checked: 1, total: 1 } })
      expect(body.inboxIncomplete).toBe(true)
      expect(log).toHaveBeenCalledWith(
        'Spam impact check finished',
        expect.objectContaining({
          failed: { inbox: 1, spam: 0 },
          failedReasons: { AccessDenied: 1 },
          missing: { inbox: 1, spam: 0 },
        }),
      )
    })

    test('expect a missing Spam email left out of the Spam totals', async () => {
      const result = await runWithReadErrors({ 'spam-html': s3Error('NoSuchKey', 404) })
      const body = JSON.parse(result.body)

      expect(body.checked).toEqual({ inbox: { checked: 3, total: 3 }, spam: { checked: 0, total: 0 } })
      expect(body.inboxIncomplete).toBe(false)
      expect(body.phrases[0].spam).toEqual({ count: 0, emails: [] })
    })

    test('expect failed reads logged by error name only, never with their message text', async () => {
      jest.mocked(mailparser).simpleParser.mockRejectedValueOnce(new Error('Bad header From: alice@example.com'))
      await runWithReadErrors({
        'inbox-body': s3Error('TimeoutError', 0, 'Read of alice@example.com timed out'),
        'inbox-html': s3Error('alice@example.com', 500, 'alice@example.com'),
      })
      const logged = JSON.stringify([
        jest.mocked(log).mock.calls,
        jest.mocked(logError).mock.calls,
        jest.mocked(logWarn).mock.calls,
      ])

      expect(log).toHaveBeenCalledWith(
        'Spam impact check finished',
        expect.objectContaining({
          failed: { inbox: 3, spam: 0 },
          failedReasons: { Error: 1, TimeoutError: 1, Unknown: 1 },
          missing: { inbox: 0, spam: 0 },
        }),
      )
      expect(logged).not.toContain('alice@example.com')
    })

    test('expect an email that fails to parse to count as failed', async () => {
      jest.mocked(mailparser).simpleParser.mockRejectedValueOnce(new Error('bad mime'))
      const result = await createHandler(fixedClock())(event)

      expect(result.statusCode).toEqual(200)
      expect(JSON.parse(result.body).checked.inbox).toEqual({ checked: 2, total: 3 })
    })

    test('expect SERVICE_UNAVAILABLE with CHECK_TIMEOUT when the list cannot load in time', async () => {
      jest.mocked(dynamodb).getAllReceived.mockRejectedValueOnce(createSpamImpactDeadlineError())
      const result = await createHandler(fixedClock())(event)

      expect(result).toEqual({ body: JSON.stringify({ code: 'CHECK_TIMEOUT' }), statusCode: 503 })
      expect(logError).not.toHaveBeenCalled()
      expect(s3.getS3ObjectStart).not.toHaveBeenCalled()
    })

    test('expect INTERNAL_SERVER_ERROR, logged by name only, when the list fails', async () => {
      jest
        .mocked(dynamodb)
        .getAllReceived.mockRejectedValueOnce(
          Object.assign(new Error('Rate exceeded'), { name: 'ProvisionedThroughputExceededException' }),
        )
      const result = await createHandler(fixedClock())(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
      expect(logError).toHaveBeenCalledWith('Spam impact check failed', {
        accountId,
        error: 'ProvisionedThroughputExceededException',
      })
    })

    test('expect an error name that is not a plain identifier logged as Unknown on INTERNAL_SERVER_ERROR', async () => {
      jest
        .mocked(dynamodb)
        .getAllReceived.mockRejectedValueOnce(
          Object.assign(new Error('Failed for alice@example.com'), { name: 'alice@example.com' }),
        )
      const result = await createHandler(fixedClock())(event)
      const logged = JSON.stringify([
        jest.mocked(log).mock.calls,
        jest.mocked(logError).mock.calls,
        jest.mocked(logWarn).mock.calls,
      ])

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
      expect(logError).toHaveBeenCalledWith('Spam impact check failed', { accountId, error: 'Unknown' })
      expect(logged).not.toContain('alice@example.com')
    })

    test('expect the finish log to hold counts only', async () => {
      const clock = jest
        .fn()
        .mockReturnValue(requestedAt + 1_500)
        .mockReturnValueOnce(requestedAt)
      await createHandler(clock)(event)
      const [, details] = jest.mocked(log).mock.calls.find(([message]) => message === 'Spam impact check finished')!

      expect(Object.keys(details as object).sort()).toEqual([
        'accountId',
        'deadlineReached',
        'durationMs',
        'failed',
        'failedReasons',
        'inboxChecked',
        'missing',
        'notAttempted',
        'phraseCount',
        'spamChecked',
      ])
      expect(details).toEqual({
        accountId,
        deadlineReached: false,
        durationMs: 1_500,
        failed: { inbox: 0, spam: 0 },
        failedReasons: {},
        inboxChecked: 3,
        missing: { inbox: 0, spam: 0 },
        notAttempted: { inbox: 0, spam: 0 },
        phraseCount: 2,
        spamChecked: 1,
      })
    })

    test('expect the event to be logged redacted', async () => {
      await createHandler(fixedClock())(event)

      expect(redactEvent).toHaveBeenCalledWith(event)
      expect(log).toHaveBeenCalledWith('Received event', { redacted: true })
    })
  })

  describe('postSpamImpactHandler', () => {
    // Lambda calls a handler with (event, context, callback); neither extra argument may reach a dependency.
    const context: Context = {
      awsRequestId: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
      callbackWaitsForEmptyEventLoop: true,
      done: jest.fn(),
      fail: jest.fn(),
      functionName: 'emails-email-api-post-spam-impact',
      functionVersion: '$LATEST',
      getRemainingTimeInMillis: () => 29_000,
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:emails-email-api-post-spam-impact',
      logGroupName: '/aws/lambda/emails-email-api-post-spam-impact',
      logStreamName: '2026/11/08/[$LATEST]abcdef0123456789',
      memoryLimitInMB: '1024',
      succeed: jest.fn(),
    }

    test('expect OK when Lambda passes a context and a callback', async () => {
      const callback = jest.fn()
      const result = await (postSpamImpactHandler as (...args: unknown[]) => ReturnType<typeof postSpamImpactHandler>)(
        event,
        context,
        callback,
      )

      expect(result).toEqual(expect.objectContaining(status.OK))
      expect(JSON.parse(result.body).checked).toEqual({
        inbox: { checked: 3, total: 3 },
        spam: { checked: 1, total: 1 },
      })
      expect(logError).not.toHaveBeenCalled()
      expect(callback).not.toHaveBeenCalled()
    })
  })
})
