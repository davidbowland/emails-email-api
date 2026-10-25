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
    jest.mocked(dynamodb).getAccountById.mockResolvedValue(account)
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

    test('expect BAD_REQUEST and nothing stored when spamFilter is invalid', async () => {
      jest.mocked(events).extractAccountFromEvent.mockImplementationOnce(() => {
        throw new Error('spamFilter.trustedSenders must have 100 entries or fewer')
      })
      const result = await putAccountHandler(event)

      expect(result).toEqual({
        ...status.BAD_REQUEST,
        body: JSON.stringify({ message: 'spamFilter.trustedSenders must have 100 entries or fewer' }),
      })
      expect(dynamodb.setAccountById).not.toHaveBeenCalled()
    })

    test('expect the validated spamFilter stored', async () => {
      const spamFilter = { blockPhrases: ['act now'], sensitivity: 'high' as const, trustedSenders: ['@domain.com'] }
      jest.mocked(events).extractAccountFromEvent.mockReturnValueOnce({ ...account, spamFilter })
      await putAccountHandler(event)

      expect(dynamodb.setAccountById).toHaveBeenCalledWith(accountId, { ...account, spamFilter })
    })

    test('expect the stored spamFilter passed through so a PUT without one keeps it', async () => {
      const storedSpamFilter = { blockPhrases: ['act now'], sensitivity: 'high' as const, trustedSenders: [] }
      jest.mocked(dynamodb).getAccountById.mockResolvedValueOnce({ ...account, spamFilter: storedSpamFilter })
      await putAccountHandler(event)

      expect(events.extractAccountFromEvent).toHaveBeenCalledWith(event, storedSpamFilter)
    })

    test('expect no stored spamFilter passed for a new account', async () => {
      jest.mocked(dynamodb).getAccountById.mockRejectedValueOnce(new Error('Account not found'))
      await putAccountHandler(event)

      expect(events.extractAccountFromEvent).toHaveBeenCalledWith(event, undefined)
    })

    test('expect INTERNAL_SERVER_ERROR and nothing stored when the stored account cannot be read', async () => {
      jest.mocked(dynamodb).getAccountById.mockRejectedValueOnce(new Error('ThrottlingException'))
      const result = await putAccountHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
      expect(events.extractAccountFromEvent).not.toHaveBeenCalled()
      expect(dynamodb.setAccountById).not.toHaveBeenCalled()
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
