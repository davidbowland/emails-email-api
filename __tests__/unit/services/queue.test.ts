import { emailId, outboundEmail } from '../__mocks__'
import { sendEmail } from '@services/queue'

const mockPost = jest.fn()
jest.mock('axios', () => ({
  create: jest.fn().mockImplementation(() => ({ post: (...args) => mockPost(...args) })),
}))
jest.mock('axios-retry')
jest.mock('@utils/logging')

describe('queue', () => {
  describe('sendEmail', () => {
    beforeAll(() => {
      mockPost.mockResolvedValue({ data: { messageId: emailId } })
    })

    it('should send email and return messageId', async () => {
      const result = await sendEmail(outboundEmail)

      expect(mockPost).toHaveBeenCalledWith('/emails', outboundEmail, {})
      expect(result).toEqual({ messageId: emailId })
    })
  })
})
