import { accountId, email, emailId } from '../../__mocks__'
import eventJson from '@events/sent/delete-email.json'
import { deleteEmailHandler } from '@handlers/sent/delete-email'
import * as dynamodb from '@services/dynamodb'
import * as s3 from '@services/s3'
import { APIGatewayProxyEventV2 } from '@types'
import * as events from '@utils/events'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@services/s3')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('delete-email', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    jest.mocked(dynamodb).getSentById.mockResolvedValue(email)
    jest.mocked(events).validateUsernameInEvent.mockReturnValue(true)
  })

  describe('deleteEmailHandler', () => {
    test('expect attachments, email, and DynamoDB deleted', async () => {
      await deleteEmailHandler(event)

      expect(dynamodb.deleteSentById).toHaveBeenCalledWith(accountId, emailId)
      expect(s3.deleteS3Object).toHaveBeenCalledWith(
        'sent/account/7yh8g-7ytguy-98ui8u-5efka-87y87y/9ijh-6tfg-dfsf3-sdfio-johac',
      )
      expect(s3.deleteS3Object).toHaveBeenCalledWith('sent/account/7yh8g-7ytguy-98ui8u-5efka-87y87y')
    })

    test('expect no attachment delete when no attachments', async () => {
      jest.mocked(dynamodb).getSentById.mockResolvedValueOnce({ ...email, attachments: undefined })
      await deleteEmailHandler(event)

      expect(dynamodb.deleteSentById).toHaveBeenCalledWith(accountId, emailId)
      expect(s3.deleteS3Object).toHaveBeenCalledWith('sent/account/7yh8g-7ytguy-98ui8u-5efka-87y87y')
      expect(s3.deleteS3Object).toHaveBeenCalledTimes(1)
    })

    test("expect FORBIDDEN when user name doesn't match", async () => {
      jest.mocked(events).validateUsernameInEvent.mockReturnValueOnce(false)
      const result = await deleteEmailHandler(event)

      expect(result).toEqual(status.FORBIDDEN)
    })

    test('expect INTERNAL_SERVER_ERROR when validateUsernameInEvent throws', async () => {
      jest.mocked(events).validateUsernameInEvent.mockImplementationOnce(() => {
        throw new Error('fnord')
      })
      const result = await deleteEmailHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    test('expect NOT_FOUND on getSentById reject', async () => {
      jest.mocked(dynamodb).getSentById.mockRejectedValueOnce(undefined)
      const result = await deleteEmailHandler(event)

      expect(result).toEqual(status.NOT_FOUND)
    })

    test('expect INTERNAL_SERVER_ERROR when deleteSentById rejects', async () => {
      jest.mocked(dynamodb).deleteSentById.mockRejectedValueOnce(undefined)
      const result = await deleteEmailHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    test('expect OK when index exists', async () => {
      const result = await deleteEmailHandler(event)

      expect(result).toEqual({ ...status.OK, body: JSON.stringify({ ...email, accountId, id: emailId }) })
    })

    test('expect OK when attachment delete rejects', async () => {
      jest.mocked(s3).deleteS3Object.mockRejectedValueOnce(undefined)
      const result = await deleteEmailHandler(event)

      expect(result).toEqual(expect.objectContaining(status.OK))
    })

    test('expect OK when email delete rejects', async () => {
      jest.mocked(dynamodb).getSentById.mockResolvedValueOnce({ ...email, attachments: undefined })
      jest.mocked(s3).deleteS3Object.mockRejectedValueOnce(undefined)
      const result = await deleteEmailHandler(event)

      expect(result).toEqual(expect.objectContaining(status.OK))
    })
  })
})
