import { email, emailBatch } from '../../__mocks__'
import spamEventJson from '@events/received/get-all-emails-spam.json'
import eventJson from '@events/received/get-all-emails.json'
import { getAllEmailsHandler } from '@handlers/received/get-all-emails'
import * as dynamodb from '@services/dynamodb'
import { APIGatewayProxyEventV2, EmailBatch } from '@types'
import * as events from '@utils/events'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('get-all-emails', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2
  const spamEvent = spamEventJson as unknown as APIGatewayProxyEventV2
  const legacyEmail: EmailBatch = { accountId: 'account', data: email, id: 'legacy' }
  const inboxEmail: EmailBatch = { accountId: 'account', data: { ...email, folder: 'inbox' }, id: 'inbox' }
  const spamEmail: EmailBatch = { accountId: 'account', data: { ...email, folder: 'spam' }, id: 'spam' }
  const mixedFolders = [legacyEmail, inboxEmail, spamEmail]
  const idsInBody = (body: string): string[] => JSON.parse(body).map((batch: EmailBatch) => batch.id)

  beforeAll(() => {
    jest.mocked(dynamodb).getReceived.mockResolvedValue(emailBatch)
    jest.mocked(events).validateUsernameInEvent.mockReturnValue(true)
  })

  describe('getAllEmailsHandler', () => {
    it("should return FORBIDDEN when user name doesn't match", async () => {
      jest.mocked(events).validateUsernameInEvent.mockReturnValueOnce(false)
      const result = await getAllEmailsHandler(event)

      expect(result).toEqual(status.FORBIDDEN)
    })

    it('should return INTERNAL_SERVER_ERROR on getReceived reject', async () => {
      jest.mocked(dynamodb).getReceived.mockRejectedValueOnce(undefined)
      const result = await getAllEmailsHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    it('should return OK with email data', async () => {
      const result = await getAllEmailsHandler(event)

      const expectedEmailBatch = emailBatch.map((batch) => ({
        ...batch,
        data: {
          ...batch.data,
          canBeBounced: false,
        },
      }))
      expect(result).toEqual({ ...status.OK, body: JSON.stringify(expectedEmailBatch) })
    })

    it('should return only Inbox emails, including those without a folder, when no folder is given', async () => {
      jest.mocked(dynamodb).getReceived.mockResolvedValueOnce(mixedFolders)
      const result = await getAllEmailsHandler(event)

      expect(idsInBody((result as { body: string }).body)).toEqual(['legacy', 'inbox'])
    })

    it('should return only Inbox emails for folder=inbox', async () => {
      jest.mocked(dynamodb).getReceived.mockResolvedValueOnce(mixedFolders)
      const inboxEvent = { ...event, queryStringParameters: { folder: 'inbox' } } as unknown as APIGatewayProxyEventV2
      const result = await getAllEmailsHandler(inboxEvent)

      expect(idsInBody((result as { body: string }).body)).toEqual(['legacy', 'inbox'])
    })

    it('should return only Spam emails for folder=spam', async () => {
      jest.mocked(dynamodb).getReceived.mockResolvedValueOnce(mixedFolders)
      const result = await getAllEmailsHandler(spamEvent)

      expect(result).toEqual(expect.objectContaining(status.OK))
      expect(idsInBody((result as { body: string }).body)).toEqual(['spam'])
    })

    it.each(['junk', 'SPAM', '', 'inbox,spam'])('should return BAD_REQUEST for folder=%s', async (folder) => {
      const badEvent = { ...event, queryStringParameters: { folder } } as unknown as APIGatewayProxyEventV2
      const result = await getAllEmailsHandler(badEvent)

      expect(result).toEqual({
        ...status.BAD_REQUEST,
        body: JSON.stringify({ message: 'folder must be one of inbox, spam' }),
      })
      expect(dynamodb.getReceived).not.toHaveBeenCalled()
    })
  })
})
