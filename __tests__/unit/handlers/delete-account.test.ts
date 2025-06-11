import { account } from '../__mocks__'
import eventJson from '@events/delete-account.json'
import { deleteAccountHandler } from '@handlers/delete-account'
import * as dynamodb from '@services/dynamodb'
import { APIGatewayProxyEventV2 } from '@types'
import * as events from '@utils/events'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('delete-account', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    jest.mocked(dynamodb).getAccountById.mockResolvedValue(account)
    jest.mocked(events).validateUsernameInEvent.mockReturnValue(true)
  })

  describe('deleteAccountHandler', () => {
    it("should return FORBIDDEN when user name doesn't match", async () => {
      jest.mocked(events).validateUsernameInEvent.mockReturnValueOnce(false)
      const result = await deleteAccountHandler(event)

      expect(result).toEqual(status.FORBIDDEN)
    })

    it('should return INTERNAL_SERVER_ERROR on deleteAccountById reject', async () => {
      jest.mocked(dynamodb).deleteAccountById.mockRejectedValueOnce(undefined)
      const result = await deleteAccountHandler(event)

      expect(result).toEqual(expect.objectContaining(status.INTERNAL_SERVER_ERROR))
    })

    it('should return OK when accountId exists', async () => {
      const result = await deleteAccountHandler(event)

      expect(result).toEqual({ ...status.OK, body: JSON.stringify(account) })
    })

    it('should return NO_CONTENT when accountId does not exist', async () => {
      jest.mocked(dynamodb).getAccountById.mockRejectedValueOnce(undefined)
      const result = await deleteAccountHandler(event)

      expect(result).toEqual(expect.objectContaining(status.NO_CONTENT))
    })
  })
})
