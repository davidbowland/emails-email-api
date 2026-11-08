import { simpleParser } from 'mailparser'

import vectors from '../spam-body-vectors.json'
import { EmailBatch, EmailFolder, ParsedMail } from '@types'
import { toWords } from '@utils/phrase-matching'
import {
  buildImpactResponse,
  countByFolder,
  getEmailFolder,
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

    it('should list at most 5 emails newest first and count every match', () => {
      const results = makeEmails('inbox', 7, 'inbox').map((email) => ({ email, matches: [true] }))
      const response = buildImpactResponse(['free money'], results, { inbox: 7, spam: 0 }, none, none)

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

      expect(buildImpactResponse(['free money', 'cruise'], results, { inbox: 2, spam: 1 }, none, none)).toEqual({
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
      })
    })

    it('should sanitize subject and from, and cut them to 200 characters', () => {
      const email = makeEmail('long', 1, 'inbox', {
        from: `a\u200Bb\u0007${'f'.repeat(300)}`,
        subject: `\u202Eq\u0000r${'s'.repeat(300)}`,
      })
      const response = buildImpactResponse(['x'], [{ email, matches: [true] }], { inbox: 1, spam: 0 }, none, none)

      expect(response.phrases[0].inbox.emails).toEqual([
        { from: `ab ${'f'.repeat(197)}`, id: 'long', subject: `q r${'s'.repeat(197)}` },
      ])
    })

    it('should cut by code point, so an emoji at the boundary is never split', () => {
      const email = makeEmail('emoji', 1, 'inbox', {
        from: `${'f'.repeat(199)}\u{1F600}g`,
        subject: `${'s'.repeat(198)}\u{1F600}\u{1F601}t`,
      })
      const response = buildImpactResponse(['x'], [{ email, matches: [true] }], { inbox: 1, spam: 0 }, none, none)

      expect(response.phrases[0].inbox.emails).toEqual([
        { from: `${'f'.repeat(199)}\u{1F600}`, id: 'emoji', subject: `${'s'.repeat(198)}\u{1F600}\u{1F601}` },
      ])
    })

    it('should give an empty string for a missing subject or from', () => {
      const email = makeEmail('blank', 1, 'inbox', { from: undefined, subject: undefined } as unknown as Partial<
        EmailBatch['data']
      >)
      const response = buildImpactResponse(['x'], [{ email, matches: [true] }], { inbox: 1, spam: 0 }, none, none)

      expect(response.phrases[0].inbox.emails).toEqual([{ from: '', id: 'blank', subject: '' }])
    })

    it('should keep the phrases in request order, duplicates included', () => {
      const response = buildImpactResponse(['b', 'a', 'b'], [], none, none, none)

      expect(response.phrases.map(({ phrase }) => phrase)).toEqual(['b', 'a', 'b'])
    })

    it.each([
      [{ inbox: 1, spam: 0 }, none, true],
      [none, { inbox: 1, spam: 0 }, true],
      [{ inbox: 0, spam: 1 }, { inbox: 0, spam: 1 }, false],
      [none, none, false],
    ])('should set inboxIncomplete from failed %p and notAttempted %p', (failed, notAttempted, expected) => {
      expect(buildImpactResponse(['x'], [], { inbox: 5, spam: 5 }, failed, notAttempted).inboxIncomplete).toEqual(
        expected,
      )
    })

    it('should count reads attempted minus those that failed as checked', () => {
      // 4 Inbox and 2 Spam reads were attempted; 1 of each failed, so only the rest have results
      const results = [
        ...makeEmails('inbox', 3, 'inbox').map((email) => ({ email, matches: [false] })),
        ...makeEmails('spam', 1, 'spam').map((email) => ({ email, matches: [false] })),
      ]
      const response = buildImpactResponse(['x'], results, { inbox: 9, spam: 4 }, { inbox: 1, spam: 1 }, none)

      expect(response.checked).toEqual({ inbox: { checked: 3, total: 9 }, spam: { checked: 1, total: 4 } })
    })

    it('should report an empty folder as zero', () => {
      expect(buildImpactResponse(['x'], [], none, none, none)).toEqual({
        checked: { inbox: { checked: 0, total: 0 }, spam: { checked: 0, total: 0 } },
        inboxIncomplete: false,
        phrases: [{ inbox: { count: 0, emails: [] }, phrase: 'x', spam: { count: 0, emails: [] } }],
      })
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
