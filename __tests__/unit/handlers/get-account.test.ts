import { account, accountId } from '../__mocks__'
import eventJson from '@events/get-account.json'
import { getAccountHandler } from '@handlers/get-account'
import * as dynamodb from '@services/dynamodb'
import { APIGatewayProxyEventV2 } from '@types'
import * as events from '@utils/events'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('get-account', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    jest.mocked(dynamodb).getAccountById.mockResolvedValue(account)
    jest.mocked(events).validateUsernameInEvent.mockReturnValue(true)
  })

  describe('getAccountHandler', () => {
    it("should return FORBIDDEN when user name doesn't match", async () => {
      jest.mocked(events).validateUsernameInEvent.mockReturnValueOnce(false)
      const result = await getAccountHandler(event)

      expect(result).toEqual(status.FORBIDDEN)
    })

    it('should return NOT_FOUND on getAccountById reject', async () => {
      jest.mocked(dynamodb).getAccountById.mockRejectedValueOnce(undefined)
      const result = await getAccountHandler(event)

      expect(result).toEqual(expect.objectContaining(status.NOT_FOUND))
    })

    it('should return OK when accountId exists', async () => {
      const result = await getAccountHandler(event)

      expect(result).toEqual({ ...status.OK, body: JSON.stringify({ ...account, id: accountId }) })
    })
  })
})
