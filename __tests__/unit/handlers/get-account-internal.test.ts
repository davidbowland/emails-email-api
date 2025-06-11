import { account, accountId } from '../__mocks__'
import eventJson from '@events/get-account-internal.json'
import { getAccountInternalHandler } from '@handlers/get-account-internal'
import * as dynamodb from '@services/dynamodb'
import { APIGatewayProxyEventV2 } from '@types'
import * as events from '@utils/events'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('get-account-internal', () => {
  const adminAccount = {
    forwardTargets: ['another@domain.com'],
    name: 'Admin',
  }
  const event = eventJson as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    jest.mocked(dynamodb).getAccountById.mockResolvedValue(account)
    jest.mocked(events).validateUsernameInEvent.mockReturnValue(true)
  })

  describe('getAccountInternalHandler', () => {
    it('should return admin account when getAccountById rejects for accountId', async () => {
      jest.mocked(dynamodb).getAccountById.mockRejectedValueOnce(undefined)
      jest.mocked(dynamodb).getAccountById.mockResolvedValueOnce(adminAccount)
      const result = await getAccountInternalHandler(event)

      expect(result).toEqual({ ...status.OK, body: JSON.stringify({ ...adminAccount, id: accountId }) })
    })

    it('should return INTERNAL_SERVER_ERROR when getAccountById rejects twice', async () => {
      jest.mocked(dynamodb).getAccountById.mockRejectedValueOnce(undefined)
      jest.mocked(dynamodb).getAccountById.mockRejectedValueOnce(undefined)
      const result = await getAccountInternalHandler(event)

      expect(result).toEqual(expect.objectContaining(status.INTERNAL_SERVER_ERROR))
    })

    it('should return OK when accountId exists', async () => {
      const result = await getAccountInternalHandler(event)

      expect(result).toEqual({ ...status.OK, body: JSON.stringify({ ...account, id: accountId }) })
    })
  })
})
