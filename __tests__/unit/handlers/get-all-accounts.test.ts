import { account, accountBatch, accountId } from '../__mocks__'
import eventJson from '@events/get-all-accounts.json'
import { getAllAccountsHandler } from '@handlers/get-all-accounts'
import * as dynamodb from '@services/dynamodb'
import { APIGatewayProxyEventV2 } from '@types'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@utils/logging')

describe('get-all-accounts', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    jest.mocked(dynamodb).getAccounts.mockResolvedValue(accountBatch)
  })

  describe('getAllItemsHandler', () => {
    it('should return INTERNAL_SERVER_ERROR on getAccounts reject', async () => {
      jest.mocked(dynamodb).getAccounts.mockRejectedValueOnce(undefined)
      const result = await getAllAccountsHandler(event)

      expect(result).toEqual(expect.objectContaining(status.INTERNAL_SERVER_ERROR))
    })

    it('should return OK and data', async () => {
      const result = await getAllAccountsHandler(event)

      expect(result).toEqual({ ...status.OK, body: JSON.stringify([{ data: account, id: accountId }]) })
    })
  })
})
