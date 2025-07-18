import { account, accountId } from '../__mocks__'
import eventJson from '@events/patch-account.json'
import { patchAccountHandler } from '@handlers/patch-account'
import * as dynamodb from '@services/dynamodb'
import { Account, APIGatewayProxyEventV2, PatchOperation } from '@types'
import * as events from '@utils/events'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('patch-account', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2
  const expectedResult = { ...account, forwardTargets: ['any@domain.com', 'another@domain.com'] } as Account

  beforeAll(() => {
    jest.mocked(dynamodb).getAccountById.mockResolvedValue(account)
    jest.mocked(events).extractJsonPatchFromEvent.mockImplementation((event) => JSON.parse(event.body))
    jest.mocked(events).validateUsernameInEvent.mockReturnValue(true)
    jest.mocked(events).formatAccount.mockReturnValue(account)
  })

  describe('patchAccountHandler', () => {
    test("expect FORBIDDEN when user name doesn't match", async () => {
      jest.mocked(events).validateUsernameInEvent.mockReturnValueOnce(false)
      const result = await patchAccountHandler(event)

      expect(result).toEqual(status.FORBIDDEN)
    })

    test('expect BAD_REQUEST when unable to parse body', async () => {
      jest.mocked(events).extractJsonPatchFromEvent.mockImplementationOnce(() => {
        throw new Error('Bad request')
      })
      const result = await patchAccountHandler(event)

      expect(result).toEqual(expect.objectContaining(status.BAD_REQUEST))
    })

    test('expect BAD_REQUEST when patch operations are invalid', async () => {
      jest
        .mocked(events)
        .extractJsonPatchFromEvent.mockReturnValueOnce([
          { op: 'replace', path: '/forwardTargets/1' },
        ] as unknown[] as PatchOperation[])
      const result = await patchAccountHandler(event)

      expect(result.statusCode).toEqual(status.BAD_REQUEST.statusCode)
    })

    test('expect BAD_REQUEST when formatAccount throws', async () => {
      jest.mocked(events).formatAccount.mockImplementationOnce(() => {
        throw new Error('something')
      })
      const result = await patchAccountHandler(event)

      expect(result.statusCode).toEqual(status.BAD_REQUEST.statusCode)
    })

    test('expect FORBIDDEN when patch operation is not forwardTargets', async () => {
      jest
        .mocked(events)
        .extractJsonPatchFromEvent.mockReturnValueOnce([
          { op: 'replace', path: '/timestamp', value: 876567656 },
        ] as unknown[] as PatchOperation[])
      const result = await patchAccountHandler(event)

      expect(result).toEqual(status.FORBIDDEN)
    })

    test('expect NOT_FOUND on getAccountById reject', async () => {
      jest.mocked(dynamodb).getAccountById.mockRejectedValueOnce(undefined)
      const result = await patchAccountHandler(event)

      expect(result).toEqual(expect.objectContaining(status.NOT_FOUND))
    })

    test('expect INTERNAL_SERVER_ERROR on setAccountById reject', async () => {
      jest.mocked(dynamodb).setAccountById.mockRejectedValueOnce(undefined)
      const result = await patchAccountHandler(event)

      expect(result).toEqual(expect.objectContaining(status.INTERNAL_SERVER_ERROR))
    })

    test('expect setAccountById called with updated object', async () => {
      await patchAccountHandler(event)

      expect(dynamodb.setAccountById).toHaveBeenCalledWith(accountId, expectedResult)
    })

    test('expect OK and body', async () => {
      const result = await patchAccountHandler(event)

      expect(result).toEqual(expect.objectContaining({ ...status.OK, body: JSON.stringify(expectedResult) }))
    })
  })
})
