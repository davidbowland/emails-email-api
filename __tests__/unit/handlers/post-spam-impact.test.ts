import * as mailparser from 'mailparser'

import eventJson from '@events/post-spam-impact.json'
import { createPostSpamImpactHandler, postSpamImpactHandler } from '@handlers/post-spam-impact'
import * as dynamodb from '@services/dynamodb'
import * as s3 from '@services/s3'
import { APIGatewayProxyEventV2, Context, EmailBatch, EmailFolder, ParsedMail } from '@types'
import * as events from '@utils/events'
import { log, logError, redactEvent } from '@utils/logging'
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
  const createHandler = (clock: () => number, createAbortSignal: (ms: number) => AbortSignal = unabortedSignal) =>
    createPostSpamImpactHandler({ clock, createAbortSignal })

  beforeAll(() => {
    jest.mocked(dynamodb).getAllReceived.mockResolvedValue(emails)
    jest.mocked(events).validateUsernameInEvent.mockReturnValue(true)
    jest.mocked(s3).getS3ObjectStart.mockImplementation(async (key) => Buffer.from(key))
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

    test('counts an unreadable email as failed', async () => {
      jest.mocked(s3).getS3ObjectStart.mockRejectedValueOnce(Object.assign(new Error('gone'), { name: 'NoSuchKey' }))
      const result = await createHandler(fixedClock())(event)
      const body = JSON.parse(result.body)

      expect(result.statusCode).toEqual(200)
      expect(body.checked).toEqual({ inbox: { checked: 2, total: 3 }, spam: { checked: 1, total: 1 } })
      expect(body.inboxIncomplete).toBe(true)
      expect(logError).not.toHaveBeenCalled()
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
        'inboxChecked',
        'notAttempted',
        'phraseCount',
        'spamChecked',
      ])
      expect(details).toEqual({
        accountId,
        deadlineReached: false,
        durationMs: 1_500,
        failed: { inbox: 0, spam: 0 },
        inboxChecked: 3,
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
