import { accountId, otherPushSubscription, pushSubscription, pushSubscriptions } from '../../__mocks__'
import eventJson from '@events/push/delete-subscription.json'
import { deleteSubscriptionHandler } from '@handlers/push/delete-subscription'
import * as dynamodb from '@services/dynamodb'
import { APIGatewayProxyEventV2 } from '@types'
import * as events from '@utils/events'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('delete-subscription', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2
  const eventWithoutEndpoint = { ...eventJson, queryStringParameters: {} } as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    jest.mocked(dynamodb).getPushSubscriptionsById.mockResolvedValue(pushSubscriptions)
    jest.mocked(events).validateUsernameInEvent.mockReturnValue(true)
  })

  describe('deleteSubscriptionHandler', () => {
    it("should return FORBIDDEN when user name doesn't match", async () => {
      jest.mocked(events).validateUsernameInEvent.mockReturnValueOnce(false)

      const result = await deleteSubscriptionHandler(event)

      expect(result).toEqual(status.FORBIDDEN)
      expect(jest.mocked(dynamodb).setPushSubscriptionsById).not.toHaveBeenCalled()
    })

    it('should return BAD_REQUEST when the endpoint is missing', async () => {
      const result = await deleteSubscriptionHandler(eventWithoutEndpoint)

      expect(result).toEqual(status.BAD_REQUEST)
      expect(jest.mocked(dynamodb).setPushSubscriptionsById).not.toHaveBeenCalled()
    })

    it('should remove the matching endpoint and return NO_CONTENT', async () => {
      const result = await deleteSubscriptionHandler(event)

      expect(jest.mocked(dynamodb).setPushSubscriptionsById).toHaveBeenCalledWith(accountId, [otherPushSubscription])
      expect(result).toEqual(status.NO_CONTENT)
    })

    it('should return NO_CONTENT for an endpoint that is not stored', async () => {
      jest.mocked(dynamodb).getPushSubscriptionsById.mockResolvedValueOnce([otherPushSubscription])

      const result = await deleteSubscriptionHandler(event)

      expect(jest.mocked(dynamodb).setPushSubscriptionsById).toHaveBeenCalledWith(accountId, [otherPushSubscription])
      expect(result).toEqual(status.NO_CONTENT)
    })

    it('should remove the item when the last subscription goes', async () => {
      jest.mocked(dynamodb).getPushSubscriptionsById.mockResolvedValueOnce([pushSubscription])

      await deleteSubscriptionHandler(event)

      expect(jest.mocked(dynamodb).setPushSubscriptionsById).toHaveBeenCalledWith(accountId, [])
    })

    it('should return INTERNAL_SERVER_ERROR when the write rejects', async () => {
      jest.mocked(dynamodb).setPushSubscriptionsById.mockRejectedValueOnce(new Error('DynamoDB unavailable'))

      const result = await deleteSubscriptionHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })
  })
})
