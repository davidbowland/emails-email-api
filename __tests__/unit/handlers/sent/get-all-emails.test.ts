import { emailBatch } from '../../__mocks__'
import eventJson from '@events/sent/get-all-emails.json'
import { getAllEmailsHandler } from '@handlers/sent/get-all-emails'
import * as dynamodb from '@services/dynamodb'
import { APIGatewayProxyEventV2 } from '@types'
import * as events from '@utils/events'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('get-all-emails', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    jest.mocked(dynamodb).getSent.mockResolvedValue(emailBatch)
    jest.mocked(events).validateUsernameInEvent.mockReturnValue(true)
  })

  describe('getAllEmailsHandler', () => {
    test("expect FORBIDDEN when user name doesn't match", async () => {
      jest.mocked(events).validateUsernameInEvent.mockReturnValueOnce(false)
      const result = await getAllEmailsHandler(event)

      expect(result).toEqual(status.FORBIDDEN)
    })

    test('expect INTERNAL_SERVER_ERROR on getReceived reject', async () => {
      jest.mocked(dynamodb).getSent.mockRejectedValueOnce(undefined)
      const result = await getAllEmailsHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    test('expect OK and data', async () => {
      const result = await getAllEmailsHandler(event)

      expect(result).toEqual({ ...status.OK, body: JSON.stringify(emailBatch) })
    })
  })
})
