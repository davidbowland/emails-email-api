import { mocked } from 'jest-mock'

import * as dynamodb from '@services/dynamodb'
import * as events from '@utils/events'
import { account } from '../__mocks__'
import { APIGatewayProxyEventV2 } from '@types'
import { deleteAccountHandler } from '@handlers/delete-account'
import eventJson from '@events/delete-account.json'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('delete-account', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    mocked(dynamodb).getAccountById.mockResolvedValue(account)
    mocked(events).validateUsernameInEvent.mockReturnValue(true)
  })

  describe('deleteAccountHandler', () => {
    test("expect FORBIDDEN when user name doesn't match", async () => {
      mocked(events).validateUsernameInEvent.mockReturnValueOnce(false)
      const result = await deleteAccountHandler(event)

      expect(result).toEqual(status.FORBIDDEN)
    })

    test('expect INTERNAL_SERVER_ERROR on deleteAccountById reject', async () => {
      mocked(dynamodb).deleteAccountById.mockRejectedValueOnce(undefined)
      const result = await deleteAccountHandler(event)

      expect(result).toEqual(expect.objectContaining(status.INTERNAL_SERVER_ERROR))
    })

    test('expect OK when accountId exists', async () => {
      const result = await deleteAccountHandler(event)

      expect(result).toEqual({ ...status.OK, body: JSON.stringify(account) })
    })

    test('expect NO_CONTENT when accountId does not exist', async () => {
      mocked(dynamodb).getAccountById.mockRejectedValueOnce(undefined)
      const result = await deleteAccountHandler(event)

      expect(result).toEqual(expect.objectContaining(status.NO_CONTENT))
    })
  })
})
