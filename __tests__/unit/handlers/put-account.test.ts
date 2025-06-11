import { account, accountId } from '../__mocks__'
import eventJson from '@events/put-account.json'
import { putAccountHandler } from '@handlers/put-account'
import * as dynamodb from '@services/dynamodb'
import { APIGatewayProxyEventV2 } from '@types'
import * as events from '@utils/events'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('put-account', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    jest.mocked(events).extractAccountFromEvent.mockReturnValue(account)
    jest.mocked(events).validateUsernameInEvent.mockReturnValue(true)
  })

  describe('putAccountHandler', () => {
    test("expect FORBIDDEN when user name doesn't match", async () => {
      jest.mocked(events).validateUsernameInEvent.mockReturnValueOnce(false)
      const result = await putAccountHandler(event)

      expect(result).toEqual(status.FORBIDDEN)
    })

    test('expect BAD_REQUEST when unable to parse body', async () => {
      jest.mocked(events).extractAccountFromEvent.mockImplementationOnce(() => {
        throw new Error('Bad request')
      })
      const result = await putAccountHandler(event)

      expect(result).toEqual(expect.objectContaining(status.BAD_REQUEST))
    })

    test('expect INTERNAL_SERVER_ERROR on setAccountById reject', async () => {
      jest.mocked(dynamodb).setAccountById.mockRejectedValueOnce(undefined)
      const result = await putAccountHandler(event)

      expect(result).toEqual(expect.objectContaining(status.INTERNAL_SERVER_ERROR))
    })

    test('expect setAccountById called with account object', async () => {
      await putAccountHandler(event)

      expect(dynamodb.setAccountById).toHaveBeenCalledWith(accountId, account)
    })

    test('expect OK and body', async () => {
      const result = await putAccountHandler(event)

      expect(result).toEqual(expect.objectContaining({ ...status.OK, body: JSON.stringify(account) }))
    })
  })
})
