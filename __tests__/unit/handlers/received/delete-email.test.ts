import { mocked } from 'jest-mock'

import * as dynamodb from '@services/dynamodb'
import * as events from '@utils/events'
import { accountId, email, emailId } from '../../__mocks__'
import { APIGatewayProxyEventV2 } from '@types'
import { deleteEmailHandler } from '@handlers/received/delete-email'
import eventJson from '@events/received/delete-email.json'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('delete-email', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    mocked(dynamodb).getReceivedById.mockResolvedValue(email)
    mocked(events).extractUsernameFromEvent.mockReturnValue(accountId)
  })

  describe('deleteEmailHandler', () => {
    test("expect FORBIDDEN when user name doesn't match", async () => {
      mocked(events).extractUsernameFromEvent.mockReturnValueOnce('no-match')
      const result = await deleteEmailHandler(event)
      expect(result).toEqual(status.FORBIDDEN)
    })

    test('expect INTERNAL_SERVER_ERROR when extractUsernameFromEvent throws', async () => {
      mocked(events).extractUsernameFromEvent.mockImplementationOnce(() => {
        throw new Error('fnord')
      })
      const result = await deleteEmailHandler(event)
      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    test('expect NOT_FOUND on getReceivedById reject', async () => {
      mocked(dynamodb).getReceivedById.mockRejectedValueOnce(undefined)
      const result = await deleteEmailHandler(event)
      expect(result).toEqual(expect.objectContaining(status.NOT_FOUND))
    })

    test('expect INTERNAL_SERVER_ERROR when deleteReceivedById rejects', async () => {
      mocked(dynamodb).deleteReceivedById.mockRejectedValueOnce(undefined)
      const result = await deleteEmailHandler(event)
      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    test('expect OK when index exists', async () => {
      const result = await deleteEmailHandler(event)
      expect(result).toEqual({ ...status.OK, body: JSON.stringify({ ...email, accountId, id: emailId }) })
    })
  })
})
