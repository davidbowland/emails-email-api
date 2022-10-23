import { mocked } from 'jest-mock'

import * as dynamodb from '@services/dynamodb'
import { account, accountBatch, accountId } from '../__mocks__'
import { APIGatewayProxyEventV2 } from '@types'
import eventJson from '@events/get-all-accounts.json'
import { getAllAccountsHandler } from '@handlers/get-all-accounts'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@utils/logging')

describe('get-all-accounts', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    mocked(dynamodb).getAccounts.mockResolvedValue(accountBatch)
  })

  describe('getAllItemsHandler', () => {
    test('expect INTERNAL_SERVER_ERROR on getAccounts reject', async () => {
      mocked(dynamodb).getAccounts.mockRejectedValueOnce(undefined)
      const result = await getAllAccountsHandler(event)
      expect(result).toEqual(expect.objectContaining(status.INTERNAL_SERVER_ERROR))
    })

    test('expect OK and data', async () => {
      const result = await getAllAccountsHandler(event)
      expect(result).toEqual({ ...status.OK, body: JSON.stringify([{ data: account, id: accountId }]) })
    })
  })
})
