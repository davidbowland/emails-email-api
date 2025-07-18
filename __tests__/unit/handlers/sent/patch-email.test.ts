import { accountId, email, emailId } from '../../__mocks__'
import eventJson from '@events/sent/patch-email.json'
import { patchEmailHandler } from '@handlers/sent/patch-email'
import * as dynamodb from '@services/dynamodb'
import { APIGatewayProxyEventV2, Email, PatchOperation } from '@types'
import * as events from '@utils/events'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('patch-email', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2
  const expectedResult = { ...email, viewed: true } as Email

  beforeAll(() => {
    jest.mocked(dynamodb).getSentById.mockResolvedValue(email)
    jest.mocked(events).extractJsonPatchFromEvent.mockImplementation((event) => JSON.parse(event.body))
    jest.mocked(events).validateUsernameInEvent.mockReturnValue(true)
  })

  describe('patchEmailHandler', () => {
    test("expect FORBIDDEN when user name doesn't match", async () => {
      jest.mocked(events).validateUsernameInEvent.mockReturnValueOnce(false)
      const result = await patchEmailHandler(event)

      expect(result).toEqual(status.FORBIDDEN)
    })

    test('expect BAD_REQUEST when unable to parse body', async () => {
      jest.mocked(events).extractJsonPatchFromEvent.mockImplementationOnce(() => {
        throw new Error('Bad request')
      })
      const result = await patchEmailHandler(event)

      expect(result).toEqual(expect.objectContaining(status.BAD_REQUEST))
    })

    test('expect BAD_REQUEST when patch operations are invalid', async () => {
      jest
        .mocked(events)
        .extractJsonPatchFromEvent.mockReturnValueOnce([
          { op: 'replace', path: '/viewed' },
        ] as unknown[] as PatchOperation[])
      const result = await patchEmailHandler(event)

      expect(result.statusCode).toEqual(status.BAD_REQUEST.statusCode)
    })

    test('expect FORBIDDEN when patch operation is not viewed', async () => {
      jest
        .mocked(events)
        .extractJsonPatchFromEvent.mockReturnValueOnce([
          { op: 'replace', path: '/timestamp', value: 876567656 },
        ] as unknown[] as PatchOperation[])
      const result = await patchEmailHandler(event)

      expect(result).toEqual(status.FORBIDDEN)
    })

    test('expect NOT_FOUND on getSentById reject', async () => {
      jest.mocked(dynamodb).getSentById.mockRejectedValueOnce(undefined)
      const result = await patchEmailHandler(event)

      expect(result).toEqual(status.NOT_FOUND)
    })

    test('expect INTERNAL_SERVER_ERROR on setSentById reject', async () => {
      jest.mocked(dynamodb).setSentById.mockRejectedValueOnce(undefined)
      const result = await patchEmailHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    test('expect setSentById called with updated object', async () => {
      await patchEmailHandler(event)

      expect(dynamodb.setSentById).toHaveBeenCalledWith(accountId, emailId, expectedResult)
    })

    test('expect OK and body', async () => {
      const result = await patchEmailHandler(event)

      expect(result).toEqual(expect.objectContaining({ ...status.OK, body: JSON.stringify(expectedResult) }))
    })
  })
})
