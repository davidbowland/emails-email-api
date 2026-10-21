import { account, accountId } from '../__mocks__'
import spamFilterEventJson from '@events/patch-account-spam-filter.json'
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
    jest.mocked(events).formatAccount.mockImplementation((account) => account)
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

    test('expect OK when patch operation is bounceSenders', async () => {
      jest
        .mocked(events)
        .extractJsonPatchFromEvent.mockReturnValueOnce([
          { op: 'add', path: '/bounceSenders/0', value: 'spam@example.com' },
        ] as unknown[] as PatchOperation[])
      const result = await patchAccountHandler(event)

      expect(result.statusCode).toEqual(status.OK.statusCode)
    })

    test.each([
      ['/spamFilter', account.spamFilter],
      ['/spamFilter/sensitivity', 'high'],
      ['/spamFilter/blockPhrases/0', 'act now'],
    ])('expect OK when patch operation path is %s', async (path, value) => {
      jest
        .mocked(events)
        .extractJsonPatchFromEvent.mockReturnValueOnce([{ op: 'add', path, value }] as unknown[] as PatchOperation[])
      const result = await patchAccountHandler(event)

      expect(result.statusCode).toEqual(status.OK.statusCode)
    })

    test.each(['/spamFilterX', '/spam', '/notificationPreview'])(
      'expect FORBIDDEN when patch operation path is %s',
      async (path) => {
        jest
          .mocked(events)
          .extractJsonPatchFromEvent.mockReturnValueOnce([
            { op: 'replace', path, value: 'x' },
          ] as unknown[] as PatchOperation[])
        const result = await patchAccountHandler(event)

        expect(result).toEqual(status.FORBIDDEN)
      },
    )

    test.each(['move', 'copy'])('expect FORBIDDEN for %s operations even on allowed paths', async (op) => {
      jest
        .mocked(events)
        .extractJsonPatchFromEvent.mockReturnValueOnce([
          { from: '/forwardTargets/0', op, path: '/spamFilter/trustedSenders/0' },
        ] as unknown[] as PatchOperation[])
      const result = await patchAccountHandler(event)

      expect(result).toEqual(status.FORBIDDEN)
      expect(dynamodb.setAccountById).not.toHaveBeenCalled()
    })

    test('expect formatAccount to validate the post-patch account', async () => {
      const spamFilterEvent = spamFilterEventJson as unknown as APIGatewayProxyEventV2
      const patchedAccount = {
        ...account,
        spamFilter: { ...account.spamFilter, blockPhrases: ['act now'], sensitivity: 'high' },
      }
      const result = await patchAccountHandler(spamFilterEvent)

      expect(events.formatAccount).toHaveBeenCalledWith(patchedAccount)
      expect(dynamodb.setAccountById).toHaveBeenCalledWith(accountId, patchedAccount)
      expect(result).toEqual(expect.objectContaining({ ...status.OK, body: JSON.stringify(patchedAccount) }))
    })

    test('expect BAD_REQUEST and nothing stored when the post-patch account is invalid', async () => {
      jest.mocked(events).formatAccount.mockImplementationOnce(() => {
        throw new Error('spamFilter.sensitivity must be one of low, medium, high')
      })
      const result = await patchAccountHandler(event)

      expect(result).toEqual({
        ...status.BAD_REQUEST,
        body: JSON.stringify({ message: 'spamFilter.sensitivity must be one of low, medium, high' }),
      })
      expect(dynamodb.setAccountById).not.toHaveBeenCalled()
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
