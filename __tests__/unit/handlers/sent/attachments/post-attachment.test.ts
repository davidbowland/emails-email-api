import { mocked } from 'jest-mock'

import * as events from '@utils/events'
import * as s3 from '@services/s3'
import * as uuid from 'uuid'
import { APIGatewayProxyEventV2 } from '@types'
import eventJson from '@events/sent/attachments/post-attachment.json'
import { postAttachmentHandler } from '@handlers/sent/attachments/post-attachment'
import { postAttachmentResult } from '../../../__mocks__'
import status from '@utils/status'

jest.mock('uuid')
jest.mock('@services/s3')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('post-attachment', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2
  const expectedUuid = 'uuuuu-uuuuu-iiiii-ddddd'

  beforeAll(() => {
    mocked(events).validateUsernameInEvent.mockReturnValue(true)
    mocked(s3).uploadS3Object.mockResolvedValue(postAttachmentResult as any)
    mocked(uuid).v4.mockReturnValue(expectedUuid)
  })

  describe('postAttachmentHandler', () => {
    test("expect FORBIDDEN when user name doesn't match", async () => {
      mocked(events).validateUsernameInEvent.mockReturnValueOnce(false)
      const result = await postAttachmentHandler(event)
      expect(result).toEqual(status.FORBIDDEN)
    })

    test('expect INTERNAL_SERVER_ERROR when validateUsernameInEvent throws', async () => {
      mocked(events).validateUsernameInEvent.mockImplementationOnce(() => {
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
        body: JSON.stringify(postAttachmentResult),
      })
    })
  })
})
