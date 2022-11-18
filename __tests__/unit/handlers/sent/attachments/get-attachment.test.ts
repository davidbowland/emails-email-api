import { mocked } from 'jest-mock'

import * as dynamodb from '@services/dynamodb'
import * as events from '@utils/events'
import * as s3 from '@services/s3'
import { APIGatewayProxyEventV2 } from '@types'
import { email } from '../../../__mocks__'
import eventJson from '@events/sent/attachments/get-attachment.json'
import { getAttachmentHandler } from '@handlers/sent/attachments/get-attachment'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@services/s3')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('get-attachment', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2
  const signedUrl = 'http://localhost/some/really/long/url#with-an-access-key'

  beforeAll(() => {
    mocked(dynamodb).getSentById.mockResolvedValue(email)
    mocked(events).validateUsernameInEvent.mockReturnValue(true)
    mocked(s3).getSignedS3Url.mockResolvedValue(signedUrl)
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

    test('expect NOT_FOUND on getSentById reject', async () => {
      mocked(dynamodb).getSentById.mockRejectedValueOnce(undefined)
      const result = await getAttachmentHandler(event)
      expect(result).toEqual(status.NOT_FOUND)
    })

    test('expect INTERNAL_SERVER_ERROR when getSignedS3Url rejects', async () => {
      mocked(s3).getSignedS3Url.mockRejectedValueOnce(undefined)
      const result = await getAttachmentHandler(event)
      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    test('expect OK when index exists', async () => {
      const result = await getAttachmentHandler(event)
      expect(mocked(s3).getSignedS3Url).toHaveBeenCalledWith(
        'sent/account/7yh8g-7ytguy-98ui8u-5efka-87y87y/9ijh-6tfg-dfsf3-sdfio-johac'
      )
      expect(result.body).toEqual(JSON.stringify({ url: signedUrl }))
      expect(result).toEqual(expect.objectContaining(status.OK))
    })
  })
})
