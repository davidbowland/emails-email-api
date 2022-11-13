import { mocked } from 'jest-mock'

import * as dynamodb from '@services/dynamodb'
import * as events from '@utils/events'
import * as queue from '@services/queue'
import * as s3 from '@services/s3'
import { account, accountId, email, emailContents, emailId, outboundEmail } from '../../__mocks__'
import { APIGatewayProxyEventV2 } from '@types'
import eventJson from '@events/sent/post-email.json'
import { postEmailHandler } from '@handlers/sent/post-email'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@services/queue')
jest.mock('@services/s3')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('post-email', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    mocked(dynamodb).getAccountById.mockResolvedValue(account)
    mocked(events).convertOutboundToContents.mockReturnValue(emailContents)
    mocked(events).convertOutboundToEmail.mockReturnValue(email)
    mocked(events).extractEmailOutboundFromEvent.mockReturnValue(outboundEmail)
    mocked(events).extractUsernameFromEvent.mockReturnValue(accountId)
    mocked(queue).sendEmail.mockResolvedValue({ messageId: emailId })
  })

  describe('postEmailHandler', () => {
    test("expect FORBIDDEN when user name doesn't match", async () => {
      mocked(events).extractUsernameFromEvent.mockReturnValueOnce('no-match')
      const result = await postEmailHandler(event)
      expect(result).toEqual(status.FORBIDDEN)
    })

    test('expect INTERNAL_SERVER_ERROR when extractUsernameFromEvent throws', async () => {
      mocked(events).extractUsernameFromEvent.mockImplementationOnce(() => {
        throw new Error('fnord')
      })
      const result = await postEmailHandler(event)
      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    test('expect NOT_FOUND on getAccountById reject', async () => {
      mocked(dynamodb).getAccountById.mockRejectedValueOnce(undefined)
      const result = await postEmailHandler(event)
      expect(result).toEqual(status.NOT_FOUND)
    })

    test('expect BAD_REQUEST on extractEmailOutboundFromEvent reject', async () => {
      mocked(events).extractEmailOutboundFromEvent.mockImplementationOnce(() => {
        throw new Error('fnord')
      })
      const result = await postEmailHandler(event)
      expect(result.statusCode).toEqual(status.BAD_REQUEST.statusCode)
    })

    test('expect INTERNAL_SERVER_ERROR on sendEmail reject', async () => {
      mocked(queue).sendEmail.mockRejectedValueOnce(undefined)
      const result = await postEmailHandler(event)
      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    test('expect correct calls for saving contents', async () => {
      await postEmailHandler(event)
      expect(mocked(s3).putS3Object).toHaveBeenCalledWith(
        'sent/account/7yh8g-7ytguy-98ui8u-5efka-87y87y',
        JSON.stringify(emailContents)
      )
      expect(mocked(dynamodb).setSentById).toHaveBeenCalledWith(accountId, emailId, email)
    })

    test('expect OK when index exists', async () => {
      const result = await postEmailHandler(event)
      expect(result).toEqual({ ...status.OK, body: JSON.stringify({ ...email, accountId, id: emailId }) })
    })
  })
})
