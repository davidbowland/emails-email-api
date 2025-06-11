import { account, accountId, email, emailContents, emailId, outboundEmail } from '../../__mocks__'
import eventJson from '@events/sent/post-email.json'
import { postEmailHandler } from '@handlers/sent/post-email'
import * as dynamodb from '@services/dynamodb'
import * as queue from '@services/queue'
import * as s3 from '@services/s3'
import { APIGatewayProxyEventV2 } from '@types'
import * as events from '@utils/events'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@services/queue')
jest.mock('@services/s3')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('post-email', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    jest.mocked(dynamodb).getAccountById.mockResolvedValue(account)
    jest.mocked(events).convertOutboundToContents.mockReturnValue(emailContents)
    jest.mocked(events).convertOutboundToEmail.mockReturnValue(email)
    jest.mocked(events).extractEmailOutboundFromEvent.mockReturnValue(outboundEmail)
    jest.mocked(events).validateUsernameInEvent.mockReturnValue(true)
    jest.mocked(queue).sendEmail.mockResolvedValue({ messageId: emailId })
  })

  describe('postEmailHandler', () => {
    test("expect FORBIDDEN when user name doesn't match", async () => {
      jest.mocked(events).validateUsernameInEvent.mockReturnValueOnce(false)
      const result = await postEmailHandler(event)

      expect(result).toEqual(status.FORBIDDEN)
    })

    test('expect INTERNAL_SERVER_ERROR when validateUsernameInEvent throws', async () => {
      jest.mocked(events).validateUsernameInEvent.mockImplementationOnce(() => {
        throw new Error('fnord')
      })
      const result = await postEmailHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    test('expect NOT_FOUND on getAccountById reject', async () => {
      jest.mocked(dynamodb).getAccountById.mockRejectedValueOnce(undefined)
      const result = await postEmailHandler(event)

      expect(result).toEqual(status.NOT_FOUND)
    })

    test('expect BAD_REQUEST on extractEmailOutboundFromEvent reject', async () => {
      jest.mocked(events).extractEmailOutboundFromEvent.mockImplementationOnce(() => {
        throw new Error('fnord')
      })
      const result = await postEmailHandler(event)

      expect(result.statusCode).toEqual(status.BAD_REQUEST.statusCode)
    })

    test('expect INTERNAL_SERVER_ERROR on sendEmail reject', async () => {
      jest.mocked(queue).sendEmail.mockRejectedValueOnce(undefined)
      const result = await postEmailHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    test('expect correct calls for saving contents', async () => {
      await postEmailHandler(event)

      expect(s3.putS3Object).toHaveBeenCalledWith(
        'sent/account/7yh8g-7ytguy-98ui8u-5efka-87y87y',
        JSON.stringify(emailContents),
      )
      expect(s3.copyS3Object).toHaveBeenCalledWith(
        'attachments/account/f_kx2qxtrl0',
        'sent/account/7yh8g-7ytguy-98ui8u-5efka-87y87y/f_kx2qxtrl0',
      )
      expect(s3.copyS3Object).toHaveBeenCalledWith(
        'attachments/account/i87trdcvbnmnbfdfyujigf',
        'sent/account/7yh8g-7ytguy-98ui8u-5efka-87y87y/i87trdcvbnmnbfdfyujigf',
      )
      expect(dynamodb.setSentById).toHaveBeenCalledWith(accountId, emailId, email)
    })

    test('expect no copy calls when no attachments', async () => {
      jest.mocked(events).convertOutboundToContents.mockReturnValue({ ...emailContents, attachments: undefined })
      await postEmailHandler(event)

      expect(s3.copyS3Object).not.toHaveBeenCalled()
    })

    test('expect OK when index exists', async () => {
      const result = await postEmailHandler(event)

      expect(result).toEqual({ ...status.OK, body: JSON.stringify({ ...email, accountId, id: emailId }) })
    })
  })
})
