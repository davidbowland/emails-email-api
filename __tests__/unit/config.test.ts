import { assertRequiredEnv } from '@config'

jest.mock('axios')
jest.mock('axios-retry')

describe('config', () => {
  describe('assertRequiredEnv', () => {
    it('should not throw when every variable is set', () => {
      expect(() => assertRequiredEnv('EMAIL_DOMAIN', 'QUEUE_API_URL')).not.toThrow()
    })

    it('should throw naming every missing variable', () => {
      expect(() => assertRequiredEnv('QUEUE_API_URL', 'NOT_SET_ONE', 'NOT_SET_TWO')).toThrow(
        'Missing required environment variable(s): NOT_SET_ONE, NOT_SET_TWO. ' +
          "Add them to this function's Environment.Variables in template.yaml.",
      )
    })
  })
})
