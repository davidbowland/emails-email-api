import { email, emailId } from '../__mocks__'
import { Email } from '@types'
import {
  buildPushPayload,
  extractSenderLabel,
  fitPushPayload,
  PUSH_PAYLOAD_MAX_BYTES,
  PUSH_SENDER_LABEL_MAX_LENGTH,
  PUSH_SUBJECT_MAX_LENGTH,
  truncateForPush,
} from '@utils/push'

jest.mock('@utils/logging')

describe('push', () => {
  describe('extractSenderLabel', () => {
    it.each([
      ['"Sarah Smith" <sarah@example.com>', 'Sarah Smith'],
      ['Sarah Smith <sarah@example.com>', 'Sarah Smith'],
      ['<sarah@example.com>', 'sarah@example.com'],
      ['sarah@example.com', 'sarah@example.com'],
    ])('should extract %s as %s', (from, expected) => {
      expect(extractSenderLabel(from)).toEqual(expected)
    })

    it.each([undefined, '', '   ', '<>', '" " <>'])('should return undefined for %s', (from) => {
      expect(extractSenderLabel(from)).toBeUndefined()
    })
  })

  describe('truncateForPush', () => {
    it('should return short text unchanged', () => {
      expect(truncateForPush('Lunch Thursday?', 200)).toEqual('Lunch Thursday?')
    })

    it('should truncate long text with an ellipsis', () => {
      expect(truncateForPush('abcdefghij', 4)).toEqual('abcd…')
    })

    it('should count code points so an emoji is never split', () => {
      expect(truncateForPush('😀😀😀', 2)).toEqual('😀😀…')
    })
  })

  describe('buildPushPayload', () => {
    const namedEmail = { ...email, from: '"Sarah Smith" <sarah@example.com>' } as Email

    it('should send emailId, senderLabel and subject for sender-and-subject', () => {
      const result = buildPushPayload(emailId, namedEmail, 'sender-and-subject')

      expect(result).toEqual({ emailId, senderLabel: 'Sarah Smith', subject: 'Hello, world' })
    })

    it('should send emailId and senderLabel for sender-only', () => {
      const result = buildPushPayload(emailId, namedEmail, 'sender-only')

      expect(result).toEqual({ emailId, senderLabel: 'Sarah Smith' })
    })

    it('should send emailId alone for none', () => {
      const result = buildPushPayload(emailId, namedEmail, 'none')

      expect(result).toEqual({ emailId })
    })

    it('should send emailId alone when from yields no label', () => {
      const result = buildPushPayload(emailId, { ...namedEmail, from: '<>' } as Email, 'sender-and-subject')

      expect(result).toEqual({ emailId })
    })

    it('should omit an empty subject', () => {
      const result = buildPushPayload(emailId, { ...namedEmail, subject: '' } as Email, 'sender-and-subject')

      expect(result).toEqual({ emailId, senderLabel: 'Sarah Smith' })
    })

    it('should truncate an oversized subject', () => {
      const longSubject = 'a'.repeat(PUSH_SUBJECT_MAX_LENGTH + 50)
      const result = buildPushPayload(emailId, { ...namedEmail, subject: longSubject } as Email, 'sender-and-subject')

      expect(result.subject).toEqual(`${'a'.repeat(PUSH_SUBJECT_MAX_LENGTH)}…`)
    })

    it('should truncate an oversized senderLabel', () => {
      const longName = 'b'.repeat(PUSH_SENDER_LABEL_MAX_LENGTH + 50)
      const result = buildPushPayload(emailId, { ...namedEmail, from: longName } as Email, 'sender-only')

      expect(result.senderLabel).toEqual(`${'b'.repeat(PUSH_SENDER_LABEL_MAX_LENGTH)}…`)
    })
  })

  describe('fitPushPayload', () => {
    it('should return a payload within budget unchanged', () => {
      const payload = { emailId, senderLabel: 'Sarah Smith', subject: 'Lunch Thursday?' }

      expect(fitPushPayload(payload)).toEqual(payload)
    })

    it('should shed the subject first', () => {
      const payload = { emailId, senderLabel: 'Sarah Smith', subject: 'c'.repeat(4000) }

      expect(fitPushPayload(payload)).toEqual({ emailId, senderLabel: 'Sarah Smith' })
    })

    it('should shed the senderLabel when shedding the subject is not enough', () => {
      const payload = { emailId, senderLabel: 'd'.repeat(4000), subject: 'e'.repeat(4000) }

      expect(fitPushPayload(payload)).toEqual({ emailId })
    })

    // The two shed branches above are unreachable from buildPushPayload, which caps both text
    // fields first. This pins that: the widest payload the builder can produce -- both fields at
    // their cap in 4-byte characters, the most expensive case per code point -- still fits, so
    // fitPushPayload is defence in depth rather than live behavior. Raising a cap or adding an
    // uncapped field far enough to break the budget breaks this test first.
    it('should leave the widest payload buildPushPayload can produce unchanged', () => {
      const widestEmail = {
        ...email,
        from: `"${'𝕏'.repeat(PUSH_SENDER_LABEL_MAX_LENGTH + 50)}" <sarah@example.com>`,
        subject: '𝕏'.repeat(PUSH_SUBJECT_MAX_LENGTH + 50),
      } as Email
      const widest = buildPushPayload(emailId, widestEmail, 'sender-and-subject')

      expect(Buffer.byteLength(JSON.stringify(widest), 'utf8')).toBeLessThanOrEqual(PUSH_PAYLOAD_MAX_BYTES)
      expect(fitPushPayload(widest)).toEqual(widest)
    })
  })
})
