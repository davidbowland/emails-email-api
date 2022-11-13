import { mocked } from 'jest-mock'

import * as dynamodb from '@services/dynamodb'
import * as events from '@utils/events'
import { accountId, email, emailId } from '../../__mocks__'
import { APIGatewayProxyEventV2 } from '@types'
import eventJson from '@events/received/put-email.json'
import { putEmailHandler } from '@handlers/received/put-email'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('put-email', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    mocked(dynamodb).setReceivedById.mockResolvedValue(undefined)
    mocked(events).extractEmailFromEvent.mockReturnValue(email)
  })

  describe('putEmailHandler', () => {
    test('expect BAD_REQUEST when email is invalid', async () => {
      mocked(events).extractEmailFromEvent.mockImplementationOnce(() => {
        throw new Error('Bad request')
      })
      const result = await putEmailHandler(event)
      expect(result).toEqual(expect.objectContaining(status.BAD_REQUEST))
    })

    test('expect setReceivedById called with email', async () => {
      await putEmailHandler(event)
      expect(mocked(dynamodb).setReceivedById).toHaveBeenCalledWith(accountId, emailId, email)
    })

    test('expect INTERNAL_SERVER_ERROR on setReceivedById reject', async () => {
      mocked(dynamodb).setReceivedById.mockRejectedValueOnce(undefined)
      const result = await putEmailHandler(event)
      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    test('expect OK and body on success', async () => {
      const result = await putEmailHandler(event)
      expect(result).toEqual(expect.objectContaining({ ...status.OK, body: JSON.stringify(email) }))
    })
  })
})
