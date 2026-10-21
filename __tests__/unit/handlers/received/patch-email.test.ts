import { accountId, email, emailId } from '../../__mocks__'
import folderEventJson from '@events/received/patch-email-folder.json'
import eventJson from '@events/received/patch-email.json'
import { patchEmailHandler } from '@handlers/received/patch-email'
import * as dynamodb from '@services/dynamodb'
import { APIGatewayProxyEventV2, Email, PatchOperation } from '@types'
import * as events from '@utils/events'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('patch-email', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2
  const expectedResult = { ...email, folder: 'inbox', viewed: true } as Email

  beforeAll(() => {
    jest.mocked(dynamodb).getReceivedById.mockResolvedValue(email)
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

    test.each(['spam', 'inbox'])('expect OK and folder stored when moving to %s', async (folder) => {
      jest
        .mocked(events)
        .extractJsonPatchFromEvent.mockReturnValueOnce([
          { op: 'replace', path: '/folder', value: folder },
        ] as unknown[] as PatchOperation[])
      const result = await patchEmailHandler(event)

      expect(dynamodb.setReceivedById).toHaveBeenCalledWith(accountId, emailId, { ...email, folder })
      expect(result).toEqual(expect.objectContaining({ ...status.OK, body: JSON.stringify({ ...email, folder }) }))
    })

    test('expect a stored folder kept when only viewed is patched', async () => {
      jest.mocked(dynamodb).getReceivedById.mockResolvedValueOnce({ ...email, folder: 'spam' })
      await patchEmailHandler(event)

      expect(dynamodb.setReceivedById).toHaveBeenCalledWith(accountId, emailId, {
        ...email,
        folder: 'spam',
        viewed: true,
      })
    })

    test('expect folder event to move the email to spam', async () => {
      const folderEvent = folderEventJson as unknown as APIGatewayProxyEventV2
      await patchEmailHandler(folderEvent)

      expect(dynamodb.setReceivedById).toHaveBeenCalledWith(accountId, emailId, { ...email, folder: 'spam' })
    })

    test("expect FORBIDDEN when the caller doesn't own the email being moved", async () => {
      jest.mocked(events).validateUsernameInEvent.mockReturnValueOnce(false)
      const result = await patchEmailHandler(folderEventJson as unknown as APIGatewayProxyEventV2)

      expect(result).toEqual(status.FORBIDDEN)
      expect(dynamodb.setReceivedById).not.toHaveBeenCalled()
    })

    test.each(['junk', 'Spam', '', null, undefined, true])(
      'expect BAD_REQUEST and nothing stored when folder value is %s',
      async (value) => {
        jest
          .mocked(events)
          .extractJsonPatchFromEvent.mockReturnValueOnce([
            { op: 'replace', path: '/folder', value },
          ] as unknown[] as PatchOperation[])
        const result = await patchEmailHandler(event)

        expect(result).toEqual({
          ...status.BAD_REQUEST,
          body: JSON.stringify({ message: 'folder must be one of inbox, spam' }),
        })
        expect(dynamodb.setReceivedById).not.toHaveBeenCalled()
      },
    )

    test.each([
      { op: 'add', path: '/folder', value: 'spam' },
      { op: 'remove', path: '/folder' },
      { from: '/viewed', op: 'copy', path: '/folder' },
      { from: '/folder', op: 'move', path: '/viewed' },
      { from: '/folder', op: 'copy', path: '/viewed' },
      { op: 'replace', path: '/folder/0', value: 'spam' },
    ])('expect FORBIDDEN for disallowed operation %o', async (operation) => {
      jest.mocked(events).extractJsonPatchFromEvent.mockReturnValueOnce([operation] as unknown[] as PatchOperation[])
      const result = await patchEmailHandler(event)

      expect(result).toEqual(status.FORBIDDEN)
      expect(dynamodb.setReceivedById).not.toHaveBeenCalled()
    })

    test('expect NOT_FOUND on getReceivedById reject', async () => {
      jest.mocked(dynamodb).getReceivedById.mockRejectedValueOnce(undefined)
      const result = await patchEmailHandler(event)

      expect(result).toEqual(status.NOT_FOUND)
    })

    test('expect INTERNAL_SERVER_ERROR on setReceivedById reject', async () => {
      jest.mocked(dynamodb).setReceivedById.mockRejectedValueOnce(undefined)
      const result = await patchEmailHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    test('expect setReceivedById called with updated object', async () => {
      await patchEmailHandler(event)

      expect(dynamodb.setReceivedById).toHaveBeenCalledWith(accountId, emailId, expectedResult)
    })

    test('expect OK and body', async () => {
      const result = await patchEmailHandler(event)

      expect(result).toEqual(expect.objectContaining({ ...status.OK, body: JSON.stringify(expectedResult) }))
    })
  })
})
