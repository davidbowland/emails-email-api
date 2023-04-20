import { mocked } from 'jest-mock'

import * as dynamodb from '@services/dynamodb'
import * as events from '@utils/events'
import * as s3 from '@services/s3'
import { accountId, email, emailId } from '../../__mocks__'
import { APIGatewayProxyEventV2 } from '@types'
import { deleteEmailHandler } from '@handlers/received/delete-email'
import eventJson from '@events/received/delete-email.json'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@services/s3')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('delete-email', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    mocked(dynamodb).getReceivedById.mockResolvedValue(email)
    mocked(events).validateUsernameInEvent.mockReturnValue(true)
  })

  describe('deleteEmailHandler', () => {
    test('expect attachments, email, and DynamoDB deleted', async () => {
      await deleteEmailHandler(event)

      expect(mocked(dynamodb).deleteReceivedById).toHaveBeenCalledWith(accountId, emailId)
      expect(mocked(s3).deleteS3Object).toHaveBeenCalledWith(
        'received/account/7yh8g-7ytguy-98ui8u-5efka-87y87y/9ijh-6tfg-dfsf3-sdfio-johac'
      )
      expect(mocked(s3).deleteS3Object).toHaveBeenCalledWith('received/account/7yh8g-7ytguy-98ui8u-5efka-87y87y')
    })

    test('expect no attachment delete when no attachments', async () => {
      mocked(dynamodb).getReceivedById.mockResolvedValueOnce({ ...email, attachments: undefined })
      await deleteEmailHandler(event)

      expect(mocked(dynamodb).deleteReceivedById).toHaveBeenCalledWith(accountId, emailId)
      expect(mocked(s3).deleteS3Object).toHaveBeenCalledWith('received/account/7yh8g-7ytguy-98ui8u-5efka-87y87y')
      expect(mocked(s3).deleteS3Object).toHaveBeenCalledTimes(1)
    })

    test("expect FORBIDDEN when user name doesn't match", async () => {
      mocked(events).validateUsernameInEvent.mockReturnValueOnce(false)
      const result = await deleteEmailHandler(event)

      expect(result).toEqual(status.FORBIDDEN)
    })

    test('expect INTERNAL_SERVER_ERROR when validateUsernameInEvent throws', async () => {
      mocked(events).validateUsernameInEvent.mockImplementationOnce(() => {
        throw new Error('fnord')
      })
      const result = await deleteEmailHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    test('expect NOT_FOUND on getReceivedById reject', async () => {
      mocked(dynamodb).getReceivedById.mockRejectedValueOnce(undefined)
      const result = await deleteEmailHandler(event)

      expect(result).toEqual(status.NOT_FOUND)
    })

    test('expect INTERNAL_SERVER_ERROR when deleteReceivedById rejects', async () => {
      mocked(dynamodb).deleteReceivedById.mockRejectedValueOnce(undefined)
      const result = await deleteEmailHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    test('expect OK when index exists', async () => {
      const result = await deleteEmailHandler(event)

      expect(result).toEqual({ ...status.OK, body: JSON.stringify({ ...email, accountId, id: emailId }) })
    })

    test('expect OK when attachment delete rejects', async () => {
      mocked(s3).deleteS3Object.mockRejectedValueOnce(undefined)
      const result = await deleteEmailHandler(event)

      expect(result).toEqual(expect.objectContaining(status.OK))
    })

    test('expect OK when email delete rejects', async () => {
      mocked(dynamodb).getReceivedById.mockResolvedValueOnce({ ...email, attachments: undefined })
      mocked(s3).deleteS3Object.mockRejectedValueOnce(undefined)
      const result = await deleteEmailHandler(event)

      expect(result).toEqual(expect.objectContaining(status.OK))
    })
  })
})
