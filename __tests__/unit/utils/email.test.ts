import { Email } from '@types'
import { canEmailBeBounced } from '@utils/email'

jest.mock('@utils/logging')

const HOURS_IN_MS = 60 * 60 * 1000

describe('email', () => {
  describe('canEmailBeBounced', () => {
    const fixedNow = 1640995200000

    beforeAll(() => {
      Date.now = jest.fn().mockReturnValue(fixedNow)
    })

    it('should return true when email timestamp is within 24 hours', () => {
      const recentTimestamp = fixedNow - 23 * HOURS_IN_MS
      const email: Email = {
        from: 'test@example.com',
        subject: 'Test',
        timestamp: recentTimestamp,
        to: ['recipient@example.com'],
        viewed: false,
      }

      const result = canEmailBeBounced(email)

      expect(result).toBe(true)
    })

    it('should return false when email timestamp is older than 24 hours', () => {
      const oldTimestamp = fixedNow - 25 * HOURS_IN_MS
      const email: Email = {
        from: 'test@example.com',
        subject: 'Test',
        timestamp: oldTimestamp,
        to: ['recipient@example.com'],
        viewed: false,
      }

      const result = canEmailBeBounced(email)

      expect(result).toBe(false)
    })
  })
})
