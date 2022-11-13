import { mocked } from 'jest-mock'

import * as dynamodb from '@services/dynamodb'
import * as events from '@utils/events'
import { accountId, email, emailId } from '../../__mocks__'
import { APIGatewayProxyEventV2 } from '@types'
import eventJson from '@events/received/get-email.json'
import { getEmailHandler } from '@handlers/received/get-email'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('get-email', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    mocked(dynamodb).getReceivedById.mockResolvedValue(email)
    mocked(events).extractUsernameFromEvent.mockReturnValue(accountId)
  })

  describe('getEmailHandler', () => {
    test("expect FORBIDDEN when user name doesn't match", async () => {
      mocked(events).extractUsernameFromEvent.mockReturnValueOnce('no-match')
      const result = await getEmailHandler(event)
      expect(result).toEqual(status.FORBIDDEN)
    })

    test('expect INTERNAL_SERVER_ERROR when extractUsernameFromEvent throws', async () => {
      mocked(events).extractUsernameFromEvent.mockImplementationOnce(() => {
        throw new Error('fnord')
      })
      const result = await getEmailHandler(event)
      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    test('expect NOT_FOUND on getReceivedById reject', async () => {
      mocked(dynamodb).getReceivedById.mockRejectedValueOnce(undefined)
      const result = await getEmailHandler(event)
      expect(result).toEqual(status.NOT_FOUND)
    })

    test('expect OK when index exists', async () => {
      const result = await getEmailHandler(event)
      expect(result).toEqual({ ...status.OK, body: JSON.stringify({ ...email, accountId, id: emailId }) })
    })
  })
})
