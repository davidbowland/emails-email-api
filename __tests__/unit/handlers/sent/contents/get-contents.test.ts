import { mocked } from 'jest-mock'

import * as dynamodb from '@services/dynamodb'
import * as events from '@utils/events'
import * as s3 from '@services/s3'
import { email, parsedContents } from '../../../__mocks__'
import { APIGatewayProxyEventV2 } from '@types'
import eventJson from '@events/sent/contents/get-contents.json'
import { getContentsHandler } from '@handlers/sent/contents/get-contents'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@services/s3')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('get-contents', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    mocked(dynamodb).getSentById.mockResolvedValue(email)
    mocked(events).validateUsernameInEvent.mockReturnValue(true)
    mocked(s3).getS3Object.mockResolvedValue({ body: JSON.stringify(parsedContents), metadata: {} })
  })

  describe('getAttachmentHandler', () => {
    test("expect FORBIDDEN when user name doesn't match", async () => {
      mocked(events).validateUsernameInEvent.mockReturnValueOnce(false)
      const result = await getContentsHandler(event)

      expect(result).toEqual(status.FORBIDDEN)
    })

    test('expect INTERNAL_SERVER_ERROR when validateUsernameInEvent throws', async () => {
      mocked(events).validateUsernameInEvent.mockImplementationOnce(() => {
        throw new Error('fnord')
      })
      const result = await getContentsHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    test('expect NOT_FOUND on getSentById reject', async () => {
      mocked(dynamodb).getSentById.mockRejectedValueOnce(undefined)
      const result = await getContentsHandler(event)

      expect(result).toEqual(expect.objectContaining(status.NOT_FOUND))
    })

    test('expect NOT_FOUND when getS3Object rejects', async () => {
      mocked(s3).getS3Object.mockRejectedValueOnce(undefined)
      const result = await getContentsHandler(event)

      expect(result).toEqual(status.NOT_FOUND)
    })

    test('expect OK when index exists', async () => {
      const result = await getContentsHandler(event)

      expect(mocked(s3.getS3Object)).toHaveBeenCalledWith('sent/account/7yh8g-7ytguy-98ui8u-5efka-87y87y')
      expect(result).toEqual({
        ...status.OK,
        body: JSON.stringify({
          attachments: [
            {
              checksum: '335a8335831f08e391d3a1d38a3167c9',
              cid: 'f_kx2qxtrl0',
              content: { data: [130], type: 'Buffer' },
              contentDisposition: 'attachment',
              contentId: '<f_kx2qxtrl0>',
              contentType: 'image/png',
              filename: 'alexa-screenshot.png',
              headers: {},
              partId: '2',
              release: null,
              size: 25277,
              type: 'attachment',
            },
            {
              checksum: 'i87trdcvbnmnbfdfyujigf',
              content: { data: [130], type: 'Buffer' },
              contentDisposition: 'attachment',
              contentId: '<f_kx2qxtrl0>',
              contentType: 'image/png',
              headers: {},
              partId: '2',
              release: null,
              size: 45678,
              type: 'attachment',
            },
          ],
          cc: ['cc@domain.com'],
          date: '2018-08-06T00:58:58.000Z',
          from: {
            html: '<span class="mp_address_group"><span class="mp_address_name">Another Person</span> &lt;<a href="mailto:another@domain.com" class="mp_address_email">another@domain.com</a>&gt;</span>',
            text: 'Another Person <another@domain.com>',
            value: [{ address: 'another@domain.com', name: 'Another Person' }],
          },
          headerLines: [
            { key: 'mime-version', line: 'MIME-Version: 1.0' },
            { key: 'date', line: 'Date: Sun, 5 Aug 2018 19:58:58 -0500' },
            { key: 'message-id', line: 'Message-ID: 7yh8g-7ytguy-98ui8u-5efka-87y87y' },
            { key: 'subject', line: 'Subject: P G Wodehouse' },
            { key: 'from', line: 'From: Person A <a@person.email>' },
            { key: 'to', line: 'To: Person B <b@person.email>' },
            {
              key: 'content-type',
              line: 'Content-Type: multipart/alternative; boundary="00000000000054a3f30572b9c865"',
            },
          ],
          headers: {},
          html: '<a href="http://www.gutenberg.org/files/8164/8164-h/8164-h.htm">http://www.gutenberg.org/files/8164/8164-h/8164-h.htm</a>\n',
          messageId: '7yh8g-7ytguy-98ui8u-5efka-87y87y',
          subject: 'P G Wodehouse',
          text: 'http://www.gutenberg.org/files/8164/8164-h/8164-h.htm\n',
          textAsHtml:
            '<p><a href="http://www.gutenberg.org/files/8164/8164-h/8164-h.htm">http://www.gutenberg.org/files/8164/8164-h/8164-h.htm</a></p>',
          to: {
            html: '<span class="mp_address_group"><a href="mailto:account@domain.com" class="mp_address_email">account@domain.com</a></span>',
            text: 'account@domain.com',
            value: [{ address: 'account@domain.com', name: '' }],
          },
        }),
      })
    })
  })
})
