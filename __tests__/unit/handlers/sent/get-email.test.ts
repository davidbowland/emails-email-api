import { mocked } from 'jest-mock'

import * as dynamodb from '@services/dynamodb'
import * as events from '@utils/events'
import { accountId, email, emailId } from '../../__mocks__'
import { APIGatewayProxyEventV2 } from '@types'
import eventJson from '@events/sent/get-email.json'
import { getEmailHandler } from '@handlers/sent/get-email'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('get-email', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    mocked(dynamodb).getSentById.mockResolvedValue(email)
    mocked(events).validateUsernameInEvent.mockReturnValue(true)
  })

  describe('getEmailHandler', () => {
    test("expect FORBIDDEN when user name doesn't match", async () => {
      mocked(events).validateUsernameInEvent.mockReturnValueOnce(false)
      const result = await getEmailHandler(event)
      expect(result).toEqual(status.FORBIDDEN)
    })

    test('expect INTERNAL_SERVER_ERROR when validateUsernameInEvent throws', async () => {
      mocked(events).validateUsernameInEvent.mockImplementationOnce(() => {
        throw new Error('fnord')
      })
      const result = await getEmailHandler(event)
      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    test('expect NOT_FOUND on getReceivedById reject', async () => {
      mocked(dynamodb).getSentById.mockRejectedValueOnce(undefined)
      const result = await getEmailHandler(event)
      expect(result).toEqual(expect.objectContaining(status.NOT_FOUND))
    })

    test('expect OK when index exists', async () => {
      const result = await getEmailHandler(event)
      expect(result).toEqual({ ...status.OK, body: JSON.stringify({ ...email, accountId, id: emailId }) })
    })
  })
})
