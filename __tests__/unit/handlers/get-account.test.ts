import { mocked } from 'jest-mock'

import * as dynamodb from '@services/dynamodb'
import * as events from '@utils/events'
import { account, accountId } from '../__mocks__'
import { APIGatewayProxyEventV2 } from '@types'
import eventJson from '@events/get-account.json'
import { getAccountHandler } from '@handlers/get-account'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('get-account', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    mocked(dynamodb).getAccountById.mockResolvedValue(account)
    mocked(events).validateUsernameInEvent.mockReturnValue(true)
  })

  describe('getAccountHandler', () => {
    test("expect FORBIDDEN when user name doesn't match", async () => {
      mocked(events).validateUsernameInEvent.mockReturnValueOnce(false)
      const result = await getAccountHandler(event)
      expect(result).toEqual(status.FORBIDDEN)
    })

    test('expect NOT_FOUND on getAccountById reject', async () => {
      mocked(dynamodb).getAccountById.mockRejectedValueOnce(undefined)
      const result = await getAccountHandler(event)
      expect(result).toEqual(expect.objectContaining(status.NOT_FOUND))
    })

    test('expect OK when accountId exists', async () => {
      const result = await getAccountHandler(event)
      expect(result).toEqual({ ...status.OK, body: JSON.stringify({ ...account, id: accountId }) })
    })
  })
})
