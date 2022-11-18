import { mocked } from 'jest-mock'

import * as dynamodb from '@services/dynamodb'
import * as events from '@utils/events'
import * as s3 from '@services/s3'
import { APIGatewayProxyEventV2, AttachmentContents } from '@types'
import { email } from '../../../__mocks__'
import eventJson from '@events/received/attachments/get-attachment.json'
import { getAttachmentHandler } from '@handlers/received/attachments/get-attachment'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@services/s3')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('get-attachment', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    mocked(dynamodb).getReceivedById.mockResolvedValue(email)
    mocked(events).validateUsernameInEvent.mockReturnValue(true)
    mocked(s3).getS3Object.mockResolvedValue({
      body: Buffer.from('fnord'),
      metadata: {
        contenttype: 'application/pdf',
        filename: 'fnord.pdf',
        size: '141119',
      },
    })
  })

  describe('getAttachmentHandler', () => {
    test("expect FORBIDDEN when user name doesn't match", async () => {
      mocked(events).validateUsernameInEvent.mockReturnValueOnce(false)
      const result = await getAttachmentHandler(event)
      expect(result).toEqual(status.FORBIDDEN)
    })

    test('expect INTERNAL_SERVER_ERROR when validateUsernameInEvent throws', async () => {
      mocked(events).validateUsernameInEvent.mockImplementationOnce(() => {
        throw new Error('fnord')
      })
      const result = await getAttachmentHandler(event)
      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    test('expect NOT_FOUND on getReceivedById reject', async () => {
      mocked(dynamodb).getReceivedById.mockRejectedValueOnce(undefined)
      const result = await getAttachmentHandler(event)
      expect(result).toEqual(expect.objectContaining(status.NOT_FOUND))
    })

    test('expect NOT_FOUND when getS3Object rejects', async () => {
      mocked(s3).getS3Object.mockRejectedValueOnce(undefined)
      const result = await getAttachmentHandler(event)
      expect(result).toEqual(status.NOT_FOUND)
    })

    test('expect INTERNAL_SERVER_ERROR when getS3Object returns invalid value', async () => {
      mocked(s3).getS3Object.mockResolvedValueOnce({} as unknown as AttachmentContents)
      const result = await getAttachmentHandler(event)
      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    test('expect OK when index exists', async () => {
      const result = await getAttachmentHandler(event)
      expect(mocked(s3).getS3Object).toHaveBeenCalledWith(
        'received/account/7yh8g-7ytguy-98ui8u-5efka-87y87y/9ijh-6tfg-dfsf3-sdfio-johac'
      )
      expect(result).toEqual({
        ...status.OK,
        body: 'Zm5vcmQ=',
        headers: {
          'Content-Disposition': 'attachment; filename="fnord.pdf"',
          'Content-Length': '141119',
          'Content-Type': 'application/pdf',
        },
        isBase64Encoded: true,
      })
    })
  })
})
