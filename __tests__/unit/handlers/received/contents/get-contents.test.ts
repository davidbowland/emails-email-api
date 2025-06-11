import * as mailparser from 'mailparser'

import { email, parsedContents } from '../../../__mocks__'
import eventJson from '@events/received/contents/get-contents.json'
import { getContentsHandler } from '@handlers/received/contents/get-contents'
import * as dynamodb from '@services/dynamodb'
import * as s3 from '@services/s3'
import { APIGatewayProxyEventV2 } from '@types'
import * as events from '@utils/events'
import status from '@utils/status'

jest.mock('mailparser')
jest.mock('@services/dynamodb')
jest.mock('@services/s3')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('get-contents', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    jest.mocked(dynamodb).getReceivedById.mockResolvedValue(email)
    jest.mocked(events).validateUsernameInEvent.mockReturnValue(true)
    jest.mocked(mailparser).simpleParser.mockResolvedValue(parsedContents)
    jest.mocked(s3).getS3Object.mockResolvedValue({ body: JSON.stringify(parsedContents), metadata: {} })
  })

  describe('getAttachmentHandler', () => {
    test("expect FORBIDDEN when user name doesn't match", async () => {
      jest.mocked(events).validateUsernameInEvent.mockReturnValueOnce(false)
      const result = await getContentsHandler(event)

      expect(result).toEqual(status.FORBIDDEN)
    })

    test('expect INTERNAL_SERVER_ERROR when validateUsernameInEvent throws', async () => {
      jest.mocked(events).validateUsernameInEvent.mockImplementationOnce(() => {
        throw new Error('fnord')
      })
      const result = await getContentsHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    test('expect NOT_FOUND on getReceivedById reject', async () => {
      jest.mocked(dynamodb).getReceivedById.mockRejectedValueOnce(undefined)
      const result = await getContentsHandler(event)

      expect(result).toEqual(expect.objectContaining(status.NOT_FOUND))
    })

    test('expect NOT_FOUND when getS3Object rejects', async () => {
      jest.mocked(s3).getS3Object.mockRejectedValueOnce(undefined)
      const result = await getContentsHandler(event)

      expect(result).toEqual(status.NOT_FOUND)
    })

    test('expect INTERNAL_SERVER_ERROR when simpleParser rejects', async () => {
      jest.mocked(mailparser).simpleParser.mockRejectedValueOnce(undefined)
      const result = await getContentsHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    test('expect OK when index exists', async () => {
      const result = await getContentsHandler(event)

      expect(s3.getS3Object).toHaveBeenCalledWith('received/account/7yh8g-7ytguy-98ui8u-5efka-87y87y')
      expect(result).toEqual({
        ...status.OK,
        body: JSON.stringify({
          attachments: [
            { filename: 'alexa-screenshot.png', id: 'f_kx2qxtrl0', size: 25277, type: 'attachment' },
            { filename: 'unknown', id: 'i87trdcvbnmnbfdfyujigf', size: 45678, type: 'attachment' },
          ],
          bodyHtml:
            '<a href="http://www.gutenberg.org/files/8164/8164-h/8164-h.htm">http://www.gutenberg.org/files/8164/8164-h/8164-h.htm</a>\n',
          bodyText: 'http://www.gutenberg.org/files/8164/8164-h/8164-h.htm\n',
          ccAddress: ['cc@domain.com'],
          date: '2018-08-06T00:58:58.000Z',
          fromAddress: {
            html: '<span class="mp_address_group"><span class="mp_address_name">Another Person</span> &lt;<a href="mailto:another@domain.com" class="mp_address_email">another@domain.com</a>&gt;</span>',
            text: 'Another Person <another@domain.com>',
            value: [
              {
                address: 'another@domain.com',
                name: 'Another Person',
              },
            ],
          },
          headers: {},
          id: '7yh8g-7ytguy-98ui8u-5efka-87y87y',
          references: [],
          replyToAddress: { display: '', value: [{ address: '', name: '' }] },
          subject: 'P G Wodehouse',
          toAddress: {
            html: '<span class="mp_address_group"><a href="mailto:account@domain.com" class="mp_address_email">account@domain.com</a></span>',
            text: 'account@domain.com',
            value: [
              {
                address: 'account@domain.com',
                name: '',
              },
            ],
          },
        }),
      })
    })
  })
})
