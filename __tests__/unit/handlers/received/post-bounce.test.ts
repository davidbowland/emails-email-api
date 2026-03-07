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
        bounceSender: 'account@domain.com',
        messageId: emailId,
        recipients: email.to,
      })
      expect(dynamodb.setReceivedById).toHaveBeenCalledWith(accountId, emailId, { ...email, bounced: true })
      expect(result).toEqual({ ...status.OK, body: JSON.stringify({ messageId }) })
    })

    it('should use account address when found in to recipients', async () => {
      const result = await bounceEmailHandler(event)

      expect(queue.bounceEmail).toHaveBeenCalledWith({
        bounceSender: 'account@domain.com',
        messageId: emailId,
        recipients: email.to,
      })
      expect(result).toEqual({ ...status.OK, body: JSON.stringify({ messageId }) })
    })

    it('should use account address when found in cc recipients', async () => {
      const emailWithCc = {
        ...email,
        to: ['other@example.com'],
        cc: ['account@domain.com'],
      }
      jest.mocked(dynamodb).getReceivedById.mockResolvedValueOnce(emailWithCc)

      const result = await bounceEmailHandler(event)

      expect(queue.bounceEmail).toHaveBeenCalledWith({
        bounceSender: 'account@domain.com',
        messageId: emailId,
        recipients: emailWithCc.to,
      })
      expect(result).toEqual({ ...status.OK, body: JSON.stringify({ messageId }) })
    })

    it('should use account address when found in bcc recipients', async () => {
      const emailWithBcc = {
        ...email,
        to: ['other@example.com'],
        cc: ['another@example.com'],
        bcc: ['account@domain.com'],
      }
      jest.mocked(dynamodb).getReceivedById.mockResolvedValueOnce(emailWithBcc)

      const result = await bounceEmailHandler(event)

      expect(queue.bounceEmail).toHaveBeenCalledWith({
        bounceSender: 'account@domain.com',
        messageId: emailId,
        recipients: emailWithBcc.to,
      })
      expect(result).toEqual({ ...status.OK, body: JSON.stringify({ messageId }) })
    })

    it('should find first address in domain when account address not in recipients', async () => {
      const emailWithDomainAddress = {
        ...email,
        to: ['other@example.com', 'someone@domain.com', 'another@domain.com'],
        cc: ['external@example.com'],
      }
      jest.mocked(dynamodb).getReceivedById.mockResolvedValueOnce(emailWithDomainAddress)

      const result = await bounceEmailHandler(event)

      expect(queue.bounceEmail).toHaveBeenCalledWith({
        bounceSender: 'someone@domain.com',
        messageId: emailId,
        recipients: emailWithDomainAddress.to,
      })
      expect(result).toEqual({ ...status.OK, body: JSON.stringify({ messageId }) })
    })

    it('should fallback to account address when no domain match found', async () => {
      const emailWithoutDomain = {
        ...email,
        to: ['other@example.com'],
        cc: ['another@example.com'],
        bcc: ['third@example.com'],
      }
      jest.mocked(dynamodb).getReceivedById.mockResolvedValueOnce(emailWithoutDomain)

      const result = await bounceEmailHandler(event)

      expect(queue.bounceEmail).toHaveBeenCalledWith({
        bounceSender: 'account@domain.com',
        messageId: emailId,
        recipients: emailWithoutDomain.to,
      })
      expect(result).toEqual({ ...status.OK, body: JSON.stringify({ messageId }) })
    })
  })
})
