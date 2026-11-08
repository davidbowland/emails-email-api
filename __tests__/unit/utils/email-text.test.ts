import { sanitizeEmailText } from '@utils/email-text'

describe('email-text', () => {
  describe('sanitizeEmailText', () => {
    it('should delete a zero-width space', () => {
      expect(sanitizeEmailText('a\u200Bb')).toEqual('ab')
    })

    it('should delete a bidi override', () => {
      expect(sanitizeEmailText('a\u202Eb')).toEqual('ab')
    })

    it('should delete a tag character', () => {
      expect(sanitizeEmailText('a\u{E0041}b')).toEqual('ab')
    })

    it('should replace a control character with one space', () => {
      expect(sanitizeEmailText('a\u000Bb')).toEqual('a b')
    })

    it('should keep newlines and tabs', () => {
      expect(sanitizeEmailText('a\nb\tc')).toEqual('a\nb\tc')
    })

    it('should leave ordinary text unchanged', () => {
      expect(sanitizeEmailText('Hello, café!')).toEqual('Hello, café!')
    })
  })
})
