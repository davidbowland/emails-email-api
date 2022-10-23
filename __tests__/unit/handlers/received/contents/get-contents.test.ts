import { mocked } from 'jest-mock'

import * as dynamodb from '@services/dynamodb'
import * as events from '@utils/events'
import * as mailparser from 'mailparser'
import * as s3 from '@services/s3'
import { accountId, email, parsedContents } from '../../../__mocks__'
import { APIGatewayProxyEventV2 } from '@types'
import eventJson from '@events/received/contents/get-contents.json'
import { getContentsHandler } from '@handlers/received/contents/get-contents'
import status from '@utils/status'

jest.mock('mailparser')
jest.mock('@services/dynamodb')
jest.mock('@services/s3')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('get-contents', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    mocked(dynamodb).getReceivedById.mockResolvedValue(email)
    mocked(events).extractUsernameFromEvent.mockReturnValue(accountId)
    mocked(mailparser).simpleParser.mockResolvedValue(parsedContents)
    mocked(s3).getS3Object.mockResolvedValue({ body: JSON.stringify(parsedContents), metadata: {} })
  })

  describe('getAttachmentHandler', () => {
    test("expect FORBIDDEN when user name doesn't match", async () => {
      mocked(events).extractUsernameFromEvent.mockReturnValueOnce('no-match')
      const result = await getContentsHandler(event)
      expect(result).toEqual(status.FORBIDDEN)
    })

    test('expect INTERNAL_SERVER_ERROR when extractUsernameFromEvent throws', async () => {
      mocked(events).extractUsernameFromEvent.mockImplementationOnce(() => {
        throw new Error('fnord')
      })
      const result = await getContentsHandler(event)
      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    test('expect NOT_FOUND on getReceivedById reject', async () => {
      mocked(dynamodb).getReceivedById.mockRejectedValueOnce(undefined)
      const result = await getContentsHandler(event)
      expect(result).toEqual(expect.objectContaining(status.NOT_FOUND))
    })

    test('expect INTERNAL_SERVER_ERROR when getS3Object rejects', async () => {
      mocked(s3).getS3Object.mockRejectedValueOnce(undefined)
      const result = await getContentsHandler(event)
      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    test('expect OK when index exists', async () => {
      const result = await getContentsHandler(event)
      expect(result).toEqual({
        ...status.OK,
        body: JSON.stringify({
          bodyHtml:
            '<a href="http://www.gutenberg.org/files/8164/8164-h/8164-h.htm">http://www.gutenberg.org/files/8164/8164-h/8164-h.htm</a>\n',
          bodyText: 'http://www.gutenberg.org/files/8164/8164-h/8164-h.htm\n',
          fromAddress: {
            display: 'Person A <a@person.email>',
            value: [{ address: 'a@person.email', name: 'Person A' }],
          },
          headers: {},
          id: '7yh8g-7ytguy-98ui8u-5efka-87y87y',
          references: [],
          replyToAddress: { display: '', value: [{ address: '', name: '' }] },
          subject: 'P G Wodehouse',
          toAddress: { display: 'Person B <b@person.email>', value: [{ address: 'b@person.email', name: 'Person B' }] },
        }),
      })
    })
  })
})
