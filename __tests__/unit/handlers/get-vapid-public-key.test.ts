import eventJson from '@events/get-vapid-public-key.json'
import { getVapidPublicKeyHandler } from '@handlers/get-vapid-public-key'
import * as push from '@services/push'
import { APIGatewayProxyEventV2 } from '@types'
import status from '@utils/status'

jest.mock('@services/push')
jest.mock('@utils/logging')

describe('get-vapid-public-key', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    jest.mocked(push).getVapidPublicKey.mockResolvedValue('a-public-key')
  })

  describe('getVapidPublicKeyHandler', () => {
    it('should return OK with the public key', async () => {
      const result = await getVapidPublicKeyHandler(event)

      expect(result).toEqual({ ...status.OK, body: JSON.stringify({ publicKey: 'a-public-key' }) })
    })

    it('should return INTERNAL_SERVER_ERROR when the SSM read rejects', async () => {
      jest.mocked(push).getVapidPublicKey.mockRejectedValueOnce(new Error('SSM unavailable'))

      const result = await getVapidPublicKeyHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })
  })
})
