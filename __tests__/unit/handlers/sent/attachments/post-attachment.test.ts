import { mocked } from 'jest-mock'

import * as events from '@utils/events'
import * as s3 from '@services/s3'
import * as uuid from 'uuid'
import { APIGatewayProxyEventV2 } from '@types'
import { accountId } from '../../../__mocks__'
import eventJson from '@events/sent/attachments/post-attachment.json'
import { postAttachmentHandler } from '@handlers/sent/attachments/post-attachment'
import status from '@utils/status'

jest.mock('uuid')
jest.mock('@services/s3')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('post-attachment', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2
  const expectedS3Result = {
    fields: {
      Policy: 'eyJleHBpcmF0aW9uIjoiMjAyMi0xMS',
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': 'ASIAXGOMQQ35UBADF3FP/20221117/us-east-1/s3/aws4_request',
      'X-Amz-Date': '20221117T061759Z',
      'X-Amz-Security-Token': 'IQoJb3JpZ2luX2VjEB4aCXVzLWVhc3QtMiJIMEYCIQCLh3B9MRsCAXTnu0',
      'X-Amz-Signature': 'f6e87c8b350576d9a3ca56b70660',
      bucket: 'emails-service-storage-test',
      key: 'attachments/account/uuuuu-uuuuu-iiiii-ddddd',
    },
    url: 'https://s3.amazonaws.com/emails-service-storage-test',
  }
  const expectedUuid = 'uuuuu-uuuuu-iiiii-ddddd'

  beforeAll(() => {
    mocked(events).extractUsernameFromEvent.mockReturnValue(accountId)
    mocked(s3).uploadS3Object.mockResolvedValue(expectedS3Result)
    mocked(uuid).v4.mockReturnValue(expectedUuid)
  })

  describe('postAttachmentHandler', () => {
    test("expect FORBIDDEN when user name doesn't match", async () => {
      mocked(events).extractUsernameFromEvent.mockReturnValueOnce('no-match')
      const result = await postAttachmentHandler(event)
      expect(result).toEqual(status.FORBIDDEN)
    })

    test('expect INTERNAL_SERVER_ERROR when extractUsernameFromEvent throws', async () => {
      mocked(events).extractUsernameFromEvent.mockImplementationOnce(() => {
        throw new Error('fnord')
      })
      const result = await postAttachmentHandler(event)
      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    test('expect INTERNAL_SERVER_ERROR when uploadS3Object rejects', async () => {
      mocked(s3).uploadS3Object.mockRejectedValueOnce(undefined)
      const result = await postAttachmentHandler(event)
      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    test('expect CREATED and result', async () => {
      const result = await postAttachmentHandler(event)
      expect(mocked(s3).uploadS3Object).toHaveBeenCalledWith('attachments/account/uuuuu-uuuuu-iiiii-ddddd')
      expect(result).toEqual({
        ...status.CREATED,
        body: JSON.stringify(expectedS3Result),
      })
    })
  })
})
