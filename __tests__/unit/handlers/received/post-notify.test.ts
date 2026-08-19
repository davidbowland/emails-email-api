import { account, accountId, email, emailId, otherPushSubscription, pushSubscriptions } from '../../__mocks__'
import eventJson from '@events/received/post-notify.json'
import { notifyEmailHandler } from '@handlers/received/post-notify'
import * as dynamodb from '@services/dynamodb'
import * as push from '@services/push'
import { APIGatewayProxyEventV2, Email } from '@types'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@services/push')
jest.mock('@utils/logging')

describe('post-notify', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2
  const namedEmail = { ...email, from: '"Sarah Smith" <sarah@example.com>' } as Email

  beforeAll(() => {
    jest.mocked(dynamodb).getAccountById.mockResolvedValue(account)
    jest.mocked(dynamodb).getPushSubscriptionsById.mockResolvedValue(pushSubscriptions)
    jest.mocked(dynamodb).getReceivedById.mockResolvedValue(namedEmail)
    jest.mocked(push).sendPushNotifications.mockResolvedValue(pushSubscriptions)
  })

  describe('notifyEmailHandler', () => {
    it('should send sender and subject for sender-and-subject', async () => {
      const result = await notifyEmailHandler(event)

      expect(jest.mocked(push).sendPushNotifications).toHaveBeenCalledWith(pushSubscriptions, {
        emailId,
        senderLabel: 'Sarah Smith',
        subject: 'Hello, world',
      })
      expect(result).toEqual(status.NO_CONTENT)
    })

    it('should send sender only for sender-only', async () => {
      jest.mocked(dynamodb).getAccountById.mockResolvedValueOnce({ ...account, notificationPreview: 'sender-only' })

      await notifyEmailHandler(event)

      expect(jest.mocked(push).sendPushNotifications).toHaveBeenCalledWith(pushSubscriptions, {
        emailId,
        senderLabel: 'Sarah Smith',
      })
    })

    it('should send the emailId alone for none', async () => {
      jest.mocked(dynamodb).getAccountById.mockResolvedValueOnce({ ...account, notificationPreview: 'none' })

      await notifyEmailHandler(event)

      expect(jest.mocked(push).sendPushNotifications).toHaveBeenCalledWith(pushSubscriptions, { emailId })
    })

    it('should use the default tier when the account is missing', async () => {
      jest.mocked(dynamodb).getAccountById.mockRejectedValueOnce(new Error('Account not found'))

      await notifyEmailHandler(event)

      expect(jest.mocked(push).sendPushNotifications).toHaveBeenCalledWith(pushSubscriptions, {
        emailId,
        senderLabel: 'Sarah Smith',
        subject: 'Hello, world',
      })
    })

    it('should return INTERNAL_SERVER_ERROR when the account read faults', async () => {
      jest.mocked(dynamodb).getAccountById.mockRejectedValueOnce(new Error('ThrottlingException'))

      const result = await notifyEmailHandler(event)

      expect(jest.mocked(push).sendPushNotifications).not.toHaveBeenCalled()
      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    it('should send the emailId alone when from yields no label', async () => {
      jest.mocked(dynamodb).getReceivedById.mockResolvedValueOnce({ ...namedEmail, from: '<>' } as Email)

      await notifyEmailHandler(event)

      expect(jest.mocked(push).sendPushNotifications).toHaveBeenCalledWith(pushSubscriptions, { emailId })
    })

    it('should truncate an oversized subject', async () => {
      jest.mocked(dynamodb).getReceivedById.mockResolvedValueOnce({ ...namedEmail, subject: 'a'.repeat(250) } as Email)

      await notifyEmailHandler(event)

      expect(jest.mocked(push).sendPushNotifications).toHaveBeenCalledWith(pushSubscriptions, {
        emailId,
        senderLabel: 'Sarah Smith',
        subject: `${'a'.repeat(200)}…`,
      })
    })

    it('should return NO_CONTENT without sending when the email is missing', async () => {
      jest.mocked(dynamodb).getReceivedById.mockRejectedValueOnce(new Error('Email not found'))

      const result = await notifyEmailHandler(event)

      expect(jest.mocked(push).sendPushNotifications).not.toHaveBeenCalled()
      expect(result).toEqual(status.NO_CONTENT)
    })

    it('should return INTERNAL_SERVER_ERROR when the email read faults', async () => {
      jest.mocked(dynamodb).getReceivedById.mockRejectedValueOnce(new Error('ThrottlingException'))

      const result = await notifyEmailHandler(event)

      expect(jest.mocked(push).sendPushNotifications).not.toHaveBeenCalled()
      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    it('should return NO_CONTENT without sending when there are no subscriptions', async () => {
      jest.mocked(dynamodb).getPushSubscriptionsById.mockResolvedValueOnce([])

      const result = await notifyEmailHandler(event)

      expect(jest.mocked(push).sendPushNotifications).not.toHaveBeenCalled()
      expect(result).toEqual(status.NO_CONTENT)
    })

    it('should prune the subscriptions the push service dropped', async () => {
      jest.mocked(push).sendPushNotifications.mockResolvedValueOnce([otherPushSubscription])

      const result = await notifyEmailHandler(event)

      expect(jest.mocked(dynamodb).setPushSubscriptionsById).toHaveBeenCalledWith(accountId, [otherPushSubscription])
      expect(result).toEqual(status.NO_CONTENT)
    })

    it('should not write when nothing was pruned', async () => {
      await notifyEmailHandler(event)

      expect(jest.mocked(dynamodb).setPushSubscriptionsById).not.toHaveBeenCalled()
    })

    it('should prune every subscription when the push service drops them all', async () => {
      jest.mocked(push).sendPushNotifications.mockResolvedValueOnce([])

      const result = await notifyEmailHandler(event)

      expect(jest.mocked(dynamodb).setPushSubscriptionsById).toHaveBeenCalledWith(accountId, [])
      expect(result).toEqual(status.NO_CONTENT)
    })

    it('should return INTERNAL_SERVER_ERROR when the subscription read rejects', async () => {
      jest.mocked(dynamodb).getPushSubscriptionsById.mockRejectedValueOnce(new Error('DynamoDB unavailable'))

      const result = await notifyEmailHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    it('should return INTERNAL_SERVER_ERROR when the send rejects', async () => {
      jest.mocked(push).sendPushNotifications.mockRejectedValueOnce(new Error('SSM unavailable'))

      const result = await notifyEmailHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })
  })
})
