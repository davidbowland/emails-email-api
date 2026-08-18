import { sendNotification } from 'web-push'

import { emailId, otherPushSubscription, pushSubscription, pushSubscriptions } from '../__mocks__'
import { getVapidPublicKey, sendPushNotifications } from '@services/push'
import * as ssm from '@services/ssm'

jest.mock('web-push')
jest.mock('@services/ssm', () => ({
  getParameter: jest.fn(),
  memoized: jest.fn().mockImplementation((fetchValue) => fetchValue),
}))
jest.mock('@utils/logging')

describe('push', () => {
  const payload = { emailId, senderLabel: 'Sarah Smith', subject: 'Lunch Thursday?' }

  beforeAll(() => {
    jest
      .mocked(ssm)
      .getParameter.mockImplementation(async (name) =>
        name === '/emails-email-api-test/vapid-public-key' ? 'a-public-key' : 'a-private-key',
      )
    jest.mocked(sendNotification).mockResolvedValue({ body: '', headers: {}, statusCode: 201 })
  })

  describe('getVapidPublicKey', () => {
    it('should read only the public key parameter', async () => {
      const result = await getVapidPublicKey()

      expect(jest.mocked(ssm).getParameter).toHaveBeenCalledWith('/emails-email-api-test/vapid-public-key')
      expect(jest.mocked(ssm).getParameter).not.toHaveBeenCalledWith('/emails-email-api-test/vapid-private-key')
      expect(result).toEqual('a-public-key')
    })
  })

  describe('sendPushNotifications', () => {
    it('should send the payload to every subscription with VAPID details', async () => {
      await sendPushNotifications([pushSubscription], payload)

      expect(jest.mocked(sendNotification)).toHaveBeenCalledWith(pushSubscription, JSON.stringify(payload), {
        vapidDetails: {
          privateKey: 'a-private-key',
          publicKey: 'a-public-key',
          subject: 'mailto:do-not-reply@domain.com',
        },
      })
    })

    it('should return every subscription when all sends succeed', async () => {
      const result = await sendPushNotifications(pushSubscriptions, payload)

      expect(result).toEqual(pushSubscriptions)
    })

    it.each([404, 410])('should drop a subscription rejected with %s', async (statusCode) => {
      jest.mocked(sendNotification).mockRejectedValueOnce({ statusCode })

      const result = await sendPushNotifications(pushSubscriptions, payload)

      expect(result).toEqual([otherPushSubscription])
    })

    it('should keep a subscription rejected for any other reason', async () => {
      jest.mocked(sendNotification).mockRejectedValueOnce({ statusCode: 500 })

      const result = await sendPushNotifications(pushSubscriptions, payload)

      expect(result).toEqual(pushSubscriptions)
    })

    it('should keep a subscription rejected with no status code', async () => {
      jest.mocked(sendNotification).mockRejectedValueOnce(new Error('socket hang up'))

      const result = await sendPushNotifications(pushSubscriptions, payload)

      expect(result).toEqual(pushSubscriptions)
    })

    it('should make no send when there are no subscriptions', async () => {
      const result = await sendPushNotifications([], payload)

      expect(jest.mocked(sendNotification)).not.toHaveBeenCalled()
      expect(result).toEqual([])
    })
  })
})
