import { simpleParser } from 'mailparser'

import vectors from '../spam-body-vectors.json'
import { EmailBatch, EmailFolder, ParsedMail, SpamImpactCounts } from '@types'
import { toWords } from '@utils/phrase-matching'
import {
  buildImpactResponse,
  countByFolder,
  countFailedReasons,
  getEmailFolder,
  isMissingObjectError,
  matchesPhrases,
  parseImpactRequest,
  selectEmailsToCheck,
  SPAM_IMPACT_BYTE_LIMIT,
  SPAM_IMPACT_CONCURRENCY,
  SPAM_IMPACT_DEADLINE_MS,
  SPAM_IMPACT_EMAILS_SHOWN,
  SPAM_IMPACT_INBOX_LIMIT,
  SPAM_IMPACT_READ_TIMEOUT_MS,
  SPAM_IMPACT_SPAM_LIMIT,
  toLoggableErrorName,
} from '@utils/spam-impact'

interface RepeatedText {
  repeatChar: string
  repeatCount: number
}

type ParsedParts = Pick<ParsedMail, 'subject' | 'text' | 'html'>

// A vector string is either literal or a repeated character, as in spam-body.test.ts
const resolveText = (value: string | RepeatedText | undefined): string | undefined =>
  typeof value === 'object' ? value.repeatChar.repeat(value.repeatCount) : value

// The raw MIME builder from emails-inbound-service's spam-body-vectors.test.ts, so both repos parse the same bytes
const part = (type: string, content: string): string =>
  `--b\r\nContent-Type: ${type}; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${content}\r\n`

const rawMessage = (subject: string, text?: string, html?: string): Buffer =>
  Buffer.from(
    [
      'From: Pat Sender <sender@example.org>',
      'To: user@example.net',
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: multipart/alternative; boundary="b"',
      '',
      text === undefined ? '' : part('text/plain', text),
      html === undefined ? '' : part('text/html', html),
      '--b--',
      '',
    ].join('\r\n'),
    'utf-8',
  )

const makeEmail = (
  id: string,
  timestamp: number,
  folder: EmailFolder | undefined,
  overrides: Partial<EmailBatch['data']> = {},
): EmailBatch => ({
  accountId: 'account',
  data: {
    from: `${id}@domain.com`,
    subject: `Subject ${id}`,
    timestamp,
    to: ['account@domain.com'],
    viewed: false,
    ...(folder === undefined ? {} : { folder }),
    ...overrides,
  },
  id,
})

const makeEmails = (prefix: string, count: number, folder: EmailFolder | undefined): EmailBatch[] =>
  Array.from({ length: count }, (_, index) => makeEmail(`${prefix}-${index}`, 1_000 + index, folder))

const folderOf = (email: EmailBatch): EmailFolder => email.data.folder ?? 'inbox'

describe('spam-impact', () => {
  describe('constants', () => {
    it('should use the limits from the spec', () => {
      expect({
        SPAM_IMPACT_BYTE_LIMIT,
        SPAM_IMPACT_CONCURRENCY,
        SPAM_IMPACT_DEADLINE_MS,
        SPAM_IMPACT_EMAILS_SHOWN,
        SPAM_IMPACT_INBOX_LIMIT,
        SPAM_IMPACT_READ_TIMEOUT_MS,
        SPAM_IMPACT_SPAM_LIMIT,
      }).toEqual({
        SPAM_IMPACT_BYTE_LIMIT: 262_144,
        SPAM_IMPACT_CONCURRENCY: 10,
        SPAM_IMPACT_DEADLINE_MS: 20_000,
        SPAM_IMPACT_EMAILS_SHOWN: 5,
        SPAM_IMPACT_INBOX_LIMIT: 100,
        SPAM_IMPACT_READ_TIMEOUT_MS: 3_000,
        SPAM_IMPACT_SPAM_LIMIT: 25,
      })
    })
  })

  describe('getEmailFolder', () => {
    it.each([
      ['inbox', 'inbox'],
      ['spam', 'spam'],
      [undefined, 'inbox'],
    ])('should read folder %p as %p', (folder, expected) => {
      expect(getEmailFolder(makeEmail('a', 1, folder as EmailFolder | undefined))).toEqual(expected)
    })
  })

  describe('countByFolder', () => {
    it('should count each folder, with no folder counted as Inbox', () => {
      const emails = [makeEmail('a', 1, 'inbox'), makeEmail('b', 2, undefined), makeEmail('c', 3, 'spam')]

      expect(countByFolder(emails)).toEqual({ inbox: 2, spam: 1 })
    })

    it('should count no emails as zero', () => {
      expect(countByFolder([])).toEqual({ inbox: 0, spam: 0 })
    })
  })

  describe('selectEmailsToCheck', () => {
    it('should take the newest 100 Inbox and 25 Spam emails and report the real totals', () => {
      const emails = [...makeEmails('inbox', 150, 'inbox'), ...makeEmails('spam', 40, 'spam')]
      const { readOrder, totals } = selectEmailsToCheck(emails)

      expect(readOrder.length).toEqual(125)
      expect(totals).toEqual({ inbox: 150, spam: 40 })
      expect(readOrder.filter((email) => folderOf(email) === 'inbox').map(({ id }) => id)).toEqual(
        Array.from({ length: 100 }, (_, index) => `inbox-${149 - index}`),
      )
      expect(readOrder.filter((email) => folderOf(email) === 'spam').map(({ id }) => id)).toEqual(
        Array.from({ length: 25 }, (_, index) => `spam-${39 - index}`),
      )
    })

    it('should break timestamp ties by id', () => {
      const emails = [makeEmail('c', 5, 'inbox'), makeEmail('a', 5, 'inbox'), makeEmail('b', 9, 'inbox')]

      expect(selectEmailsToCheck(emails).readOrder.map(({ id }) => id)).toEqual(['b', 'a', 'c'])
    })

    it('should read 4 Inbox emails then 1 Spam email, and continue with Inbox alone once Spam runs out', () => {
      const emails = [...makeEmails('inbox', 12, 'inbox'), ...makeEmails('spam', 2, 'spam')]
      const { readOrder } = selectEmailsToCheck(emails)

      expect(readOrder.map(folderOf)).toEqual([
        'inbox',
        'inbox',
        'inbox',
        'inbox',
        'spam',
        'inbox',
        'inbox',
        'inbox',
        'inbox',
        'spam',
        'inbox',
        'inbox',
        'inbox',
        'inbox',
      ])
    })

    it('should continue with Spam alone once Inbox runs out', () => {
      const emails = [...makeEmails('inbox', 2, 'inbox'), ...makeEmails('spam', 3, 'spam')]

      expect(selectEmailsToCheck(emails).readOrder.map(folderOf)).toEqual(['inbox', 'inbox', 'spam', 'spam', 'spam'])
    })

    it('should count an email with no folder as Inbox', () => {
      const emails = [makeEmail('legacy', 5, undefined), makeEmail('spam', 4, 'spam')]
      const { readOrder, totals } = selectEmailsToCheck(emails)

      expect(totals).toEqual({ inbox: 1, spam: 1 })
      expect(readOrder.map(({ id }) => id)).toEqual(['legacy', 'spam'])
    })

    it.each([
      ['inbox', 'inbox-1', { inbox: 2, spam: 2 }],
      ['spam', 'spam-1', { inbox: 3, spam: 1 }],
    ])('should leave out excludeEmailId from %s and its total', (_, excludeEmailId, totals) => {
      const emails = [...makeEmails('inbox', 3, 'inbox'), ...makeEmails('spam', 2, 'spam')]
      const result = selectEmailsToCheck(emails, excludeEmailId)

      expect(result.totals).toEqual(totals)
      expect(result.readOrder.map(({ id }) => id)).not.toContain(excludeEmailId)
    })

    it('should exclude nothing when excludeEmailId is not found', () => {
      const emails = makeEmails('inbox', 3, 'inbox')

      expect(selectEmailsToCheck(emails, 'missing').totals).toEqual({ inbox: 3, spam: 0 })
    })

    it('should give an empty read order for no emails', () => {
      expect(selectEmailsToCheck([])).toEqual({ readOrder: [], totals: { inbox: 0, spam: 0 } })
    })

    it('should not change its input', () => {
      const emails = [makeEmail('a', 1, 'inbox'), makeEmail('b', 2, 'inbox')]
      selectEmailsToCheck(emails)

      expect(emails.map(({ id }) => id)).toEqual(['a', 'b'])
    })
  })

  describe('matchesPhrases', () => {
    const phraseWords = [toWords('free money')]

    it.each(vectors.wholeEmail)('vector: $note', ({ expected, html, phrase, subject, text }) => {
      const parsed = {
        html: resolveText(html),
        subject: resolveText(subject),
        text: resolveText(text),
      } as unknown as ParsedParts

      expect(matchesPhrases(parsed, [toWords(phrase)])).toEqual([expected])
    })

    it.each(vectors.wholeEmail)(
      'vector through simpleParser: $note',
      async ({ expected, html, phrase, subject, text }) => {
        const parsed = await simpleParser(
          rawMessage(resolveText(subject) as string, resolveText(text), resolveText(html)),
        )

        expect(matchesPhrases(parsed, [toWords(phrase)])).toEqual([expected])
      },
    )

    it.each([
      ['the text part', { subject: 'Hello', text: 'Get free money now' }],
      ['the HTML part', { html: '<p>Get <b>free</b> money now</p>', subject: 'Hello', text: 'Nothing' }],
      ['the subject', { subject: 'Free money inside', text: 'Nothing' }],
    ])('should match a phrase found only in %s', (_, parsed) => {
      expect(matchesPhrases(parsed as ParsedParts, phraseWords)).toEqual([true])
    })

    it('should not match a phrase spanning the subject and the body', () => {
      expect(matchesPhrases({ subject: 'Claim your free', text: 'money now' } as ParsedParts, phraseWords)).toEqual([
        false,
      ])
    })

    it('should not match a phrase inside a script', () => {
      const parsed = { html: '<script>free money</script><p>safe</p>', subject: 'Hello' } as ParsedParts

      expect(matchesPhrases(parsed, phraseWords)).toEqual([false])
    })

    it('should not match words past character 1,024 of the subject', () => {
      const parsed = { subject: `${'x '.repeat(512)}free money`, text: 'safe' } as ParsedParts

      expect(matchesPhrases(parsed, phraseWords)).toEqual([false])
    })

    it('should answer every phrase in order, duplicates included', () => {
      const parsed = { subject: 'Hello', text: 'Get free money now' } as ParsedParts

      expect(
        matchesPhrases(parsed, [toWords('free money'), toWords('absent'), toWords('free money'), toWords('hello')]),
      ).toEqual([true, false, true, true])
    })

    it('should match nothing in an email with no subject or body', () => {
      expect(matchesPhrases({} as ParsedParts, phraseWords)).toEqual([false])
    })
  })

  describe('buildImpactResponse', () => {
    const none = { inbox: 0, spam: 0 }
    const counts = (overrides: Partial<SpamImpactCounts> = {}): SpamImpactCounts => ({
      failed: none,
      missing: none,
      notAttempted: none,
      totals: none,
      ...overrides,
    })

    it('should list at most 5 emails newest first and count every match', () => {
      const results = makeEmails('inbox', 7, 'inbox').map((email) => ({ email, matches: [true] }))
      const response = buildImpactResponse(['free money'], results, counts({ totals: { inbox: 7, spam: 0 } }))

      expect(response.phrases[0].inbox.count).toEqual(7)
      expect(response.phrases[0].inbox.emails.map(({ id }) => id)).toEqual([
        'inbox-6',
        'inbox-5',
        'inbox-4',
        'inbox-3',
        'inbox-2',
      ])
    })

    it('should give the full response shape for each folder', () => {
      const inboxMatch = makeEmail('inbox-match', 3, 'inbox')
      const inboxMiss = makeEmail('inbox-miss', 2, undefined)
      const spamMatch = makeEmail('spam-match', 1, 'spam')
      const results = [
        { email: inboxMatch, matches: [true, false] },
        { email: inboxMiss, matches: [false, false] },
        { email: spamMatch, matches: [true, true] },
      ]
      const spamEmails = [{ from: 'spam-match@domain.com', id: 'spam-match', subject: 'Subject spam-match' }]

      expect(buildImpactResponse(['free money', 'cruise'], results, counts({ totals: { inbox: 2, spam: 1 } }))).toEqual(
        {
          checked: { inbox: { checked: 2, total: 2 }, spam: { checked: 1, total: 1 } },
          inboxIncomplete: false,
          phrases: [
            {
              inbox: {
                count: 1,
                emails: [{ from: 'inbox-match@domain.com', id: 'inbox-match', subject: 'Subject inbox-match' }],
              },
              phrase: 'free money',
              spam: { count: 1, emails: spamEmails },
            },
            {
              inbox: { count: 0, emails: [] },
              phrase: 'cruise',
              spam: { count: 1, emails: spamEmails },
            },
          ],
        },
      )
    })

    it('should sanitize subject and from, and cut them to 200 characters', () => {
      const email = makeEmail('long', 1, 'inbox', {
        from: `a\u200Bb\u0007${'f'.repeat(300)}`,
        subject: `\u202Eq\u0000r${'s'.repeat(300)}`,
      })
      const response = buildImpactResponse(
        ['x'],
        [{ email, matches: [true] }],
        counts({ totals: { inbox: 1, spam: 0 } }),
      )

      expect(response.phrases[0].inbox.emails).toEqual([
        { from: `ab ${'f'.repeat(197)}`, id: 'long', subject: `q r${'s'.repeat(197)}` },
      ])
    })

    it('should cut by code point, so an emoji at the boundary is never split', () => {
      const email = makeEmail('emoji', 1, 'inbox', {
        from: `${'f'.repeat(199)}\u{1F600}g`,
        subject: `${'s'.repeat(198)}\u{1F600}\u{1F601}t`,
      })
      const response = buildImpactResponse(
        ['x'],
        [{ email, matches: [true] }],
        counts({ totals: { inbox: 1, spam: 0 } }),
      )

      expect(response.phrases[0].inbox.emails).toEqual([
        { from: `${'f'.repeat(199)}\u{1F600}`, id: 'emoji', subject: `${'s'.repeat(198)}\u{1F600}\u{1F601}` },
      ])
    })

    it('should give an empty string for a missing subject or from', () => {
      const email = makeEmail('blank', 1, 'inbox', { from: undefined, subject: undefined } as unknown as Partial<
        EmailBatch['data']
      >)
      const response = buildImpactResponse(
        ['x'],
        [{ email, matches: [true] }],
        counts({ totals: { inbox: 1, spam: 0 } }),
      )

      expect(response.phrases[0].inbox.emails).toEqual([{ from: '', id: 'blank', subject: '' }])
    })

    it('should keep the phrases in request order, duplicates included', () => {
      const response = buildImpactResponse(['b', 'a', 'b'], [], counts())

      expect(response.phrases.map(({ phrase }) => phrase)).toEqual(['b', 'a', 'b'])
    })

    it.each([
      [{ inbox: 1, spam: 0 }, none, true],
      [none, { inbox: 1, spam: 0 }, true],
      [{ inbox: 0, spam: 1 }, { inbox: 0, spam: 1 }, false],
      [none, none, false],
    ])('should set inboxIncomplete from failed %p and notAttempted %p', (failed, notAttempted, expected) => {
      expect(
        buildImpactResponse(['x'], [], counts({ failed, notAttempted, totals: { inbox: 5, spam: 5 } })).inboxIncomplete,
      ).toEqual(expected)
    })

    it('should count reads attempted minus those that failed as checked', () => {
      // 4 Inbox and 2 Spam reads were attempted; 1 of each failed, so only the rest have results
      const results = [
        ...makeEmails('inbox', 3, 'inbox').map((email) => ({ email, matches: [false] })),
        ...makeEmails('spam', 1, 'spam').map((email) => ({ email, matches: [false] })),
      ]
      const response = buildImpactResponse(
        ['x'],
        results,
        counts({ failed: { inbox: 1, spam: 1 }, totals: { inbox: 9, spam: 4 } }),
      )

      expect(response.checked).toEqual({ inbox: { checked: 3, total: 9 }, spam: { checked: 1, total: 4 } })
    })

    it('should leave emails with a missing raw file out of the total and the incomplete flag', () => {
      const results = makeEmails('inbox', 20, 'inbox').map((email) => ({ email, matches: [false] }))
      const response = buildImpactResponse(
        ['x'],
        results,
        counts({ missing: { inbox: 5, spam: 0 }, totals: { inbox: 25, spam: 0 } }),
      )

      expect(response.checked.inbox).toEqual({ checked: 20, total: 20 })
      expect(response.inboxIncomplete).toBe(false)
    })

    it('should leave missing Spam emails out of the Spam total', () => {
      const results = makeEmails('spam', 2, 'spam').map((email) => ({ email, matches: [false] }))
      const response = buildImpactResponse(
        ['x'],
        results,
        counts({ missing: { inbox: 0, spam: 3 }, totals: { inbox: 0, spam: 5 } }),
      )

      expect(response.checked.spam).toEqual({ checked: 2, total: 2 })
      expect(response.inboxIncomplete).toBe(false)
    })

    it('should still mark the Inbox incomplete when missing and failed reads are mixed', () => {
      const results = makeEmails('inbox', 3, 'inbox').map((email) => ({ email, matches: [false] }))
      const response = buildImpactResponse(
        ['x'],
        results,
        counts({ failed: { inbox: 1, spam: 0 }, missing: { inbox: 2, spam: 0 }, totals: { inbox: 6, spam: 0 } }),
      )

      expect(response.checked.inbox).toEqual({ checked: 3, total: 4 })
      expect(response.inboxIncomplete).toBe(true)
    })

    it('should report an empty folder as zero', () => {
      expect(buildImpactResponse(['x'], [], counts())).toEqual({
        checked: { inbox: { checked: 0, total: 0 }, spam: { checked: 0, total: 0 } },
        inboxIncomplete: false,
        phrases: [{ inbox: { count: 0, emails: [] }, phrase: 'x', spam: { count: 0, emails: [] } }],
      })
    })
  })

  describe('isMissingObjectError', () => {
    it.each([
      ['NoSuchKey', { $metadata: { httpStatusCode: 404 }, name: 'NoSuchKey' }],
      [
        'NoSuchKey without metadata',
        Object.assign(new Error('The specified key does not exist.'), { name: 'NoSuchKey' }),
      ],
      ['a 404 NotFound', { $metadata: { httpStatusCode: 404 }, name: 'NotFound' }],
    ])('should treat %s as missing', (_, error) => {
      expect(isMissingObjectError(error)).toBe(true)
    })

    it.each([
      ['AccessDenied', { $metadata: { httpStatusCode: 403 }, name: 'AccessDenied' }],
      ['NoSuchBucket', { $metadata: { httpStatusCode: 404 }, name: 'NoSuchBucket' }],
      ['NotFound without a 404', { $metadata: { httpStatusCode: 500 }, name: 'NotFound' }],
      ['a bare 404 with another name', { $metadata: { httpStatusCode: 404 }, name: 'UnknownError' }],
      ['a timeout', Object.assign(new Error('aborted'), { name: 'TimeoutError' })],
      ['undefined', undefined],
      ['null', null],
      ['a string', 'NoSuchKey'],
    ])('should treat %s as a failure', (_, error) => {
      expect(isMissingObjectError(error)).toBe(false)
    })
  })

  describe('toLoggableErrorName', () => {
    it.each([
      ['NoSuchKey', { name: 'NoSuchKey' }],
      ['TimeoutError', Object.assign(new Error('timed out for alice@example.com'), { name: 'TimeoutError' })],
      ['Error', new Error('bad mime from bob@example.com')],
      ['A'.repeat(64), { name: 'A'.repeat(64) }],
    ])('should keep the name %s', (expected, error) => {
      expect(toLoggableErrorName(error)).toEqual(expected)
    })

    it.each([
      ['an address', { name: 'alice@example.com' }],
      ['spaces', { name: 'Not Found' }],
      ['a leading digit', { name: '404' }],
      ['65 characters', { name: 'A'.repeat(65) }],
      ['an empty name', { name: '' }],
      ['a non-string name', { name: 404 }],
      ['a string thrown', 'alice@example.com'],
      ['undefined', undefined],
      ['null', null],
    ])('should give Unknown for %s', (_, error) => {
      expect(toLoggableErrorName(error)).toEqual('Unknown')
    })
  })

  describe('countFailedReasons', () => {
    it('should count each error name', () => {
      expect(countFailedReasons(['NoSuchBucket', 'TimeoutError', 'NoSuchBucket', 'TimeoutError', 'Error'])).toEqual({
        Error: 1,
        NoSuchBucket: 2,
        TimeoutError: 2,
      })
    })

    it('should give an empty object when nothing failed', () => {
      expect(countFailedReasons([])).toEqual({})
    })

    it('should count names that match Object.prototype members as plain names', () => {
      expect(countFailedReasons(['constructor', 'toString', 'constructor'])).toEqual({ constructor: 2, toString: 1 })
    })
  })

  describe('parseImpactRequest', () => {
    const phrase = 'free money'
    const tooManyPhrases = Array.from({ length: 101 }, (_, index) => `phrase ${index}`)

    it.each([
      ['a missing body', undefined],
      ['an empty body', ''],
      ['invalid JSON', '{"phrases":'],
      ['a JSON array', JSON.stringify([phrase])],
      ['JSON null', 'null'],
      ['a missing phrases', JSON.stringify({})],
      ['phrases not an array', JSON.stringify({ phrases: phrase })],
      ['0 phrases', JSON.stringify({ phrases: [] })],
      ['101 phrases', JSON.stringify({ phrases: tooManyPhrases })],
      ['a phrase that is not a string', JSON.stringify({ phrases: [phrase, 42] })],
      ['a 101-character phrase', JSON.stringify({ phrases: ['a'.repeat(101)] })],
      ['a phrase with no letter or digit', JSON.stringify({ phrases: ['!!!'] })],
      ['an empty excludeEmailId', JSON.stringify({ excludeEmailId: '', phrases: [phrase] })],
      ['a 257-character excludeEmailId', JSON.stringify({ excludeEmailId: 'e'.repeat(257), phrases: [phrase] })],
      ['a non-string excludeEmailId', JSON.stringify({ excludeEmailId: 7, phrases: [phrase] })],
    ])('should throw for %s', (_, body) => {
      expect(() => parseImpactRequest(body)).toThrow(Error)
    })

    it.each([
      ['a phrase with no letter or digit', ['visible phrase', '!!!?'], '!!!?'],
      ['a 101-character phrase', ['visible phrase', `secret${'z'.repeat(95)}`], 'secret'],
      ['a phrase that is not a string', ['visible phrase', 42], '42'],
    ])('should not quote any phrase in the message for %s', (_, phrases, badText) => {
      const message = (() => {
        try {
          parseImpactRequest(JSON.stringify({ phrases }))
          return 'no error'
        } catch (error) {
          return (error as Error).message
        }
      })()

      expect(message).toMatch(/^phrases /)
      expect(message).not.toContain(badText)
      expect(message).not.toContain('visible phrase')
    })

    it.each([
      ['0 phrases', JSON.stringify({ phrases: [] }), 'phrases must have 1 to 100 entries'],
      [
        'a long phrase',
        JSON.stringify({ phrases: ['a'.repeat(101)] }),
        'phrases entries must be 100 characters or fewer',
      ],
      [
        'a phrase with no letter or digit',
        JSON.stringify({ phrases: ['!!!'] }),
        'phrases entries must contain at least one letter or number',
      ],
      ['phrases not an array', JSON.stringify({ phrases: 'x' }), 'phrases must be an array of strings'],
      [
        'an empty excludeEmailId',
        JSON.stringify({ excludeEmailId: '', phrases: ['x'] }),
        'excludeEmailId must be a string of 1 to 256 characters',
      ],
      ['invalid JSON', '{', 'Request body must be a JSON object'],
    ])('should explain the problem for %s', (_, body, message) => {
      expect(() => parseImpactRequest(body)).toThrow(message)
    })

    it('should accept 100 phrases of 100 characters, with duplicates', () => {
      const phrases = [...Array.from({ length: 99 }, () => 'p'.repeat(100)), phrase]

      expect(parseImpactRequest(JSON.stringify({ phrases })).phrases).toEqual(phrases)
    })

    it('should return a new object with only the known fields', () => {
      const parsed = parseImpactRequest(
        JSON.stringify({ excludeEmailId: 'e'.repeat(256), extra: true, phrases: [phrase, phrase] }),
      )

      expect(parsed).toEqual({ excludeEmailId: 'e'.repeat(256), phrases: [phrase, phrase] })
    })

    it('should leave out excludeEmailId when absent', () => {
      expect(parseImpactRequest(JSON.stringify({ phrases: [phrase] }))).toEqual({ phrases: [phrase] })
    })
  })
})
