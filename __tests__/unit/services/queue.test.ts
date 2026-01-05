import { emailId, messageId, outboundEmail } from '../__mocks__'
import { bounceEmail, sendEmail } from '@services/queue'

const mockPost = jest.fn()
jest.mock('axios', () => ({
  create: jest.fn().mockImplementation(() => ({ post: (...args) => mockPost(...args) })),
}))
jest.mock('axios-retry')
jest.mock('@utils/logging')

describe('queue', () => {
  describe('sendEmail', () => {
    beforeAll(() => {
      mockPost.mockResolvedValue({ data: { messageId } })
    })

    it('should send email and return messageId', async () => {
      const result = await sendEmail(outboundEmail)

      expect(mockPost).toHaveBeenCalledWith('/emails', outboundEmail, {})
      expect(result).toEqual({ messageId })
    })
  })

  describe('bounceEmail', () => {
    beforeAll(() => {
      mockPost.mockResolvedValue({ data: { messageId } })
    })

    it('should bounce email and return messageId', async () => {
      const bounceData = {
        bounceSender: 'sender@domain.com',
        messageId: emailId,
        recipients: ['test@domain.com'],
      }
      const result = await bounceEmail(bounceData)

      expect(mockPost).toHaveBeenCalledWith('/bounces', bounceData, {})
      expect(result).toEqual({ messageId })
    })
  })
})
