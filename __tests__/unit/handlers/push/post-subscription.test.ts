import { accountId, otherPushSubscription, pushSubscription } from '../../__mocks__'
import eventJson from '@events/push/post-subscription.json'
import { postSubscriptionHandler } from '@handlers/push/post-subscription'
import * as dynamodb from '@services/dynamodb'
import { APIGatewayProxyEventV2 } from '@types'
import * as events from '@utils/events'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('post-subscription', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    jest.mocked(dynamodb).getPushSubscriptionsById.mockResolvedValue([])
    jest.mocked(events).extractPushSubscriptionFromEvent.mockReturnValue(pushSubscription)
    jest.mocked(events).validateUsernameInEvent.mockReturnValue(true)
  })

  describe('postSubscriptionHandler', () => {
    it("should return FORBIDDEN when user name doesn't match", async () => {
      jest.mocked(events).validateUsernameInEvent.mockReturnValueOnce(false)

      const result = await postSubscriptionHandler(event)

      expect(result).toEqual(status.FORBIDDEN)
      expect(jest.mocked(dynamodb).setPushSubscriptionsById).not.toHaveBeenCalled()
    })

    it('should return BAD_REQUEST when the subscription is invalid', async () => {
      jest.mocked(events).extractPushSubscriptionFromEvent.mockImplementationOnce(() => {
        throw new Error('subscription.keys.auth must be a non-empty string')
      })

      const result = await postSubscriptionHandler(event)

      expect(result).toEqual({
        ...status.BAD_REQUEST,
        body: JSON.stringify({ message: 'subscription.keys.auth must be a non-empty string' }),
      })
    })

    it('should store the subscription and return NO_CONTENT', async () => {
      const result = await postSubscriptionHandler(event)

      expect(jest.mocked(dynamodb).setPushSubscriptionsById).toHaveBeenCalledWith(accountId, [pushSubscription])
      expect(result).toEqual(status.NO_CONTENT)
    })

    it('should keep other endpoints and dedupe the incoming one', async () => {
      jest.mocked(dynamodb).getPushSubscriptionsById.mockResolvedValueOnce([otherPushSubscription, pushSubscription])

      await postSubscriptionHandler(event)

      expect(jest.mocked(dynamodb).setPushSubscriptionsById).toHaveBeenCalledWith(accountId, [
        otherPushSubscription,
        pushSubscription,
      ])
    })

    it('should return INTERNAL_SERVER_ERROR when the write rejects', async () => {
      jest.mocked(dynamodb).setPushSubscriptionsById.mockRejectedValueOnce(new Error('DynamoDB unavailable'))

      const result = await postSubscriptionHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })
  })
})
