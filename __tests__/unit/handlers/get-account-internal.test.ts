import { mocked } from 'jest-mock'

import * as dynamodb from '@services/dynamodb'
import * as events from '@utils/events'
import { account, accountId } from '../__mocks__'
import { APIGatewayProxyEventV2 } from '@types'
import eventJson from '@events/get-account-internal.json'
import { getAccountInternalHandler } from '@handlers/get-account-internal'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('get-account-internal', () => {
  const adminAccount = {
    forwardTargets: ['another@domain.com'],
  }
  const event = eventJson as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    mocked(dynamodb).getAccountById.mockResolvedValue(account)
    mocked(events).extractUsernameFromEvent.mockReturnValue(accountId)
  })

  describe('getAccountInternalHandler', () => {
    test('expect admin account when getAccountById rejects for accountId', async () => {
      mocked(dynamodb).getAccountById.mockRejectedValueOnce(undefined)
      mocked(dynamodb).getAccountById.mockResolvedValueOnce(adminAccount)
      const result = await getAccountInternalHandler(event)
      expect(result).toEqual({ ...status.OK, body: JSON.stringify({ ...adminAccount, id: accountId }) })
    })

    test('expect INTERNAL_SERVER_ERROR when getAccountById rejects twice', async () => {
      mocked(dynamodb).getAccountById.mockRejectedValueOnce(undefined)
      mocked(dynamodb).getAccountById.mockRejectedValueOnce(undefined)
      const result = await getAccountInternalHandler(event)
      expect(result).toEqual(expect.objectContaining(status.INTERNAL_SERVER_ERROR))
    })

    test('expect OK when accountId exists', async () => {
      const result = await getAccountInternalHandler(event)
      expect(result).toEqual({ ...status.OK, body: JSON.stringify({ ...account, id: accountId }) })
    })
  })
})
