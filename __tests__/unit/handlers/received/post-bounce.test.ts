import { accountId, email, emailId, messageId } from '../../__mocks__'
import eventJson from '@events/received/post-bounce.json'
import { bounceEmailHandler } from '@handlers/received/post-bounce'
import * as dynamodb from '@services/dynamodb'
import * as queue from '@services/queue'
import { APIGatewayProxyEventV2 } from '@types'
import * as events from '@utils/events'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@services/queue')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('post-bounce', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    jest.mocked(dynamodb).getReceivedById.mockResolvedValue(email)
    jest.mocked(dynamodb).setReceivedById.mockResolvedValue({} as any)
    jest.mocked(queue).bounceEmail.mockResolvedValue({ messageId })
    jest.mocked(events).validateUsernameInEvent.mockReturnValue(true)
  })

  describe('bounceEmailHandler', () => {
    it("should return FORBIDDEN when user name doesn't match", async () => {
      jest.mocked(events).validateUsernameInEvent.mockReturnValueOnce(false)
      const result = await bounceEmailHandler(event)

      expect(result).toEqual(status.FORBIDDEN)
    })

    it('should return INTERNAL_SERVER_ERROR when validateUsernameInEvent throws', async () => {
      jest.mocked(events).validateUsernameInEvent.mockImplementationOnce(() => {
        throw new Error('fnord')
      })
      const result = await bounceEmailHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    it('should return NOT_FOUND on getReceivedById reject', async () => {
      jest.mocked(dynamodb).getReceivedById.mockRejectedValueOnce(undefined)
      const result = await bounceEmailHandler(event)

      expect(result).toEqual(status.NOT_FOUND)
    })

    it('should return BAD_REQUEST when email is already bounced', async () => {
      const bouncedEmail = { ...email, bounced: true }
      jest.mocked(dynamodb).getReceivedById.mockResolvedValueOnce(bouncedEmail)
      const result = await bounceEmailHandler(event)

      expect(result).toEqual(status.BAD_REQUEST)
    })

    it('should return INTERNAL_SERVER_ERROR when bounceEmail throws', async () => {
      jest.mocked(queue).bounceEmail.mockRejectedValueOnce(new Error('Queue service error'))
      const result = await bounceEmailHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    it('should return INTERNAL_SERVER_ERROR when setReceivedById throws', async () => {
      jest.mocked(dynamodb).setReceivedById.mockRejectedValueOnce(new Error('DynamoDB error'))
      const result = await bounceEmailHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    it('should bounce email and update record when email exists and not bounced', async () => {
      const result = await bounceEmailHandler(event)

      expect(queue.bounceEmail).toHaveBeenCalledWith({
        bounceSender: email.to[0],
        messageId: emailId,
        recipients: email.to,
      })
      expect(dynamodb.setReceivedById).toHaveBeenCalledWith(accountId, emailId, { ...email, bounced: true })
      expect(result).toEqual({ ...status.OK, body: JSON.stringify({ messageId }) })
    })

    it('should find bounce sender with case-insensitive matching', async () => {
      const emailWithMixedCase = {
        ...email,
        to: ['other@domain.com', 'ACCOUNT@domain.com', 'another@domain.com'],
      }
      jest.mocked(dynamodb).getReceivedById.mockResolvedValueOnce(emailWithMixedCase)

      const result = await bounceEmailHandler(event)

      expect(queue.bounceEmail).toHaveBeenCalledWith({
        bounceSender: 'account@domain.com',
        messageId: emailId,
        recipients: emailWithMixedCase.to,
      })
      expect(dynamodb.setReceivedById).toHaveBeenCalledWith(accountId, emailId, {
        ...emailWithMixedCase,
        bounced: true,
      })
      expect(result).toEqual({ ...status.OK, body: JSON.stringify({ messageId }) })
    })
  })
})
