import { createSpamImpactDeadlineError, isSpamImpactDeadlineError } from '@utils/spam-impact-errors'

describe('spam-impact-errors', () => {
  describe('createSpamImpactDeadlineError', () => {
    it('should be an Error with its own name and no request content', () => {
      const error = createSpamImpactDeadlineError()

      expect(error).toBeInstanceOf(Error)
      expect(error.name).toEqual('SpamImpactDeadlineError')
      expect(error.message).toEqual('Spam impact check deadline reached')
    })
  })

  describe('isSpamImpactDeadlineError', () => {
    it.each([
      ['the deadline error', createSpamImpactDeadlineError(), true],
      ['another error', new Error('Spam impact check deadline reached'), false],
      ['a non-error with the same name', { name: 'SpamImpactDeadlineError' }, false],
      ['undefined', undefined, false],
    ])('should recognize %s', (_, error, expected) => {
      expect(isSpamImpactDeadlineError(error)).toEqual(expected)
    })
  })
})
