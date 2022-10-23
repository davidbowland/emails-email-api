import { mocked } from 'jest-mock'

import * as dynamodb from '@services/dynamodb'
import * as events from '@utils/events'
import * as s3 from '@services/s3'
import { accountId, email } from '../../../__mocks__'
import { APIGatewayProxyEventV2 } from '@types'
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
    mocked(events).extractUsernameFromEvent.mockReturnValue(accountId)
    mocked(s3).getS3Object.mockResolvedValue({
      body: Buffer.from('fnord'),
      metadata: {
        'x-amz-meta-contenttype': 'application/pdf',
        'x-amz-meta-filename': 'fnord.pdf',
        'x-amz-meta-size': '141119',
      },
    })
  })

  describe('getAttachmentHandler', () => {
    test("expect FORBIDDEN when user name doesn't match", async () => {
      mocked(events).extractUsernameFromEvent.mockReturnValueOnce('no-match')
      const result = await getAttachmentHandler(event)
      expect(result).toEqual(status.FORBIDDEN)
    })

    test('expect INTERNAL_SERVER_ERROR when extractUsernameFromEvent throws', async () => {
      mocked(events).extractUsernameFromEvent.mockImplementationOnce(() => {
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

    test('expect INTERNAL_SERVER_ERROR when getS3Object rejects', async () => {
      mocked(s3).getS3Object.mockRejectedValueOnce(undefined)
      const result = await getAttachmentHandler(event)
      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    test('expect OK when index exists', async () => {
      const result = await getAttachmentHandler(event)
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
