import { account, accountId, email, emailId, pushSubscription, pushSubscriptions } from '../__mocks__'
import {
  deleteAccountById,
  deletePushSubscriptionsById,
  deleteReceivedById,
  deleteSentById,
  getAccountById,
  getAccounts,
  getPushSubscriptionsById,
  getReceived,
  getReceivedById,
  getSent,
  getSentById,
  incrementSpamSuggestionUsage,
  setAccountById,
  setPushSubscriptionsById,
  setReceivedById,
  setSentById,
} from '@services/dynamodb'

const mockSend = jest.fn()
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DeleteItemCommand: jest.fn().mockImplementation((x) => x),
  DynamoDBClient: jest.fn(() => ({
    send: (...args) => mockSend(...args),
  })),
  GetItemCommand: jest.fn().mockImplementation((x) => x),
  PutItemCommand: jest.fn().mockImplementation((x) => x),
  QueryCommand: jest.fn().mockImplementation((x) => x),
  ScanCommand: jest.fn().mockImplementation((x) => x),
  UpdateItemCommand: jest.fn().mockImplementation((x) => x),
}))
jest.mock('@utils/logging', () => ({
  xrayCapture: jest.fn().mockImplementation((x) => x),
}))

describe('dynamodb', () => {
  describe('accounts', () => {
    describe('deleteAccountById', () => {
      it('should pass accountId to delete', async () => {
        await deleteAccountById(accountId)

        expect(mockSend).toHaveBeenCalledWith({
          Key: {
            Account: {
              S: `${accountId}`,
            },
          },
          TableName: 'accounts-table',
        })
      })
    })

    describe('getAccountById', () => {
      beforeAll(() => {
        mockSend.mockResolvedValue({ Item: { Data: { S: JSON.stringify(account) } } })
      })

      test('expect accountId passed to get', async () => {
        await getAccountById(accountId)

        expect(mockSend).toHaveBeenCalledWith({
          Key: {
            Account: {
              S: `${accountId}`,
            },
          },
          TableName: 'accounts-table',
        })
      })

      test('expect data parsed and returned', async () => {
        const result = await getAccountById(accountId)

        expect(result).toEqual(account)
      })

      it('should throw error when account not found', async () => {
        mockSend.mockResolvedValueOnce({ Item: null })

        await expect(getAccountById(accountId)).rejects.toThrow('Account not found')
      })

      test('expect notificationPreview and spamFilter defaulted for a legacy account', async () => {
        mockSend.mockResolvedValueOnce({
          Item: { Data: { S: JSON.stringify({ forwardTargets: [], name: 'Legacy' }) } },
        })

        const result = await getAccountById(accountId)

        expect(result).toEqual({
          bounceSenders: [],
          forwardTargets: [],
          name: 'Legacy',
          notificationPreview: 'sender-and-subject',
          spamFilter: { blockPhrases: [], sensitivity: 'medium', trustedSenders: [] },
        })
      })

      test('expect a stored spamFilter kept', async () => {
        const spamFilter = { blockPhrases: ['act now'], sensitivity: 'high', trustedSenders: ['@domain.com'] }
        mockSend.mockResolvedValueOnce({
          Item: { Data: { S: JSON.stringify({ ...account, spamFilter }) } },
        })

        const result = await getAccountById(accountId)

        expect(result.spamFilter).toEqual(spamFilter)
      })
    })

    describe('getAccounts', () => {
      beforeAll(() => {
        mockSend.mockResolvedValue({
          Items: [{ Account: { S: `${accountId}` }, Data: { S: JSON.stringify(account) } }],
        })
      })

      test('expect data parsed and returned', async () => {
        const result = await getAccounts()

        expect(result).toEqual([
          {
            data: {
              bounceSenders: [],
              forwardTargets: ['any@domain.com'],
              name: 'Any',
              notificationPreview: 'sender-and-subject',
              spamFilter: { blockPhrases: [], sensitivity: 'medium', trustedSenders: [] },
            },
            id: 'account',
          },
        ])
      })

      test('expect empty object with no data returned', async () => {
        mockSend.mockResolvedValueOnce({ Items: [] })
        const result = await getAccounts()

        expect(result).toEqual([])
      })
    })

    describe('setAccountById', () => {
      test('expect accountId and data passed to put', async () => {
        await setAccountById(accountId, account)

        expect(mockSend).toHaveBeenCalledWith({
          Item: {
            Account: {
              S: `${accountId}`,
            },
            Data: {
              S: JSON.stringify(account),
            },
          },
          TableName: 'accounts-table',
        })
      })
    })
  })

  describe('push subscriptions', () => {
    describe('getPushSubscriptionsById', () => {
      beforeAll(() => {
        mockSend.mockResolvedValue({ Item: { Data: { S: JSON.stringify(pushSubscriptions) } } })
      })

      test('expect accountId passed to get', async () => {
        await getPushSubscriptionsById(accountId)

        expect(mockSend).toHaveBeenCalledWith({
          Key: {
            Account: {
              S: `${accountId}`,
            },
          },
          TableName: 'push-subscriptions-table',
        })
      })

      test('expect subscriptions parsed and returned', async () => {
        const result = await getPushSubscriptionsById(accountId)

        expect(result).toEqual(pushSubscriptions)
      })

      test('expect empty array when no item stored', async () => {
        mockSend.mockResolvedValueOnce({ Item: undefined })

        const result = await getPushSubscriptionsById(accountId)

        expect(result).toEqual([])
      })
    })

    describe('setPushSubscriptionsById', () => {
      test('expect subscriptions passed to put', async () => {
        await setPushSubscriptionsById(accountId, [pushSubscription])

        expect(mockSend).toHaveBeenCalledWith({
          Item: {
            Account: {
              S: `${accountId}`,
            },
            Data: {
              S: JSON.stringify([pushSubscription]),
            },
          },
          TableName: 'push-subscriptions-table',
        })
      })

      test('expect item deleted when the array empties', async () => {
        await setPushSubscriptionsById(accountId, [])

        expect(mockSend).toHaveBeenCalledWith({
          Key: {
            Account: {
              S: `${accountId}`,
            },
          },
          TableName: 'push-subscriptions-table',
        })
      })
    })

    describe('deletePushSubscriptionsById', () => {
      test('expect accountId passed to delete', async () => {
        await deletePushSubscriptionsById(accountId)

        expect(mockSend).toHaveBeenCalledWith({
          Key: {
            Account: {
              S: `${accountId}`,
            },
          },
          TableName: 'push-subscriptions-table',
        })
      })
    })
  })

  describe('spam suggestion usage', () => {
    describe('incrementSpamSuggestionUsage', () => {
      // 2026-10-21T13:45:00.000Z
      const now = () => 1_792_590_300_000

      beforeAll(() => {
        mockSend.mockResolvedValue({})
      })

      test('expect a conditional increment keyed by account and UTC day', async () => {
        await incrementSpamSuggestionUsage(accountId, 20, now)

        expect(mockSend).toHaveBeenCalledWith({
          ConditionExpression: 'attribute_not_exists(#count) OR #count < :limit',
          ExpressionAttributeNames: {
            '#count': 'Count',
            '#expires': 'Expires',
          },
          ExpressionAttributeValues: {
            ':expires': { N: '1792713600' },
            ':limit': { N: '20' },
            ':one': { N: '1' },
          },
          Key: {
            Account: { S: accountId },
            Day: { S: '2026-10-21' },
          },
          TableName: 'spam-suggestion-usage-table',
          UpdateExpression: 'ADD #count :one SET #expires = :expires',
        })
      })

      test('expect the day to roll over at UTC midnight', async () => {
        await incrementSpamSuggestionUsage(accountId, 20, () => 1_792_627_199_999)
        await incrementSpamSuggestionUsage(accountId, 20, () => 1_792_627_200_000)

        expect(mockSend).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({ Key: { Account: { S: accountId }, Day: { S: '2026-10-21' } } }),
        )
        expect(mockSend).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ Key: { Account: { S: accountId }, Day: { S: '2026-10-22' } } }),
        )
      })

      test.each([0, -1, NaN])('expect false without calling DynamoDB when the limit is %s', async (limit) => {
        const result = await incrementSpamSuggestionUsage(accountId, limit, now)

        expect(result).toBe(false)
        expect(mockSend).not.toHaveBeenCalled()
      })

      test('expect true when under the limit', async () => {
        const result = await incrementSpamSuggestionUsage(accountId, 20, now)

        expect(result).toBe(true)
      })

      test('expect false when the limit is reached', async () => {
        mockSend.mockRejectedValueOnce(
          Object.assign(new Error('The conditional request failed'), { name: 'ConditionalCheckFailedException' }),
        )
        const result = await incrementSpamSuggestionUsage(accountId, 20, now)

        expect(result).toBe(false)
      })

      test('expect other errors rethrown', async () => {
        mockSend.mockRejectedValueOnce(new Error('ProvisionedThroughputExceededException'))

        await expect(incrementSpamSuggestionUsage(accountId, 20, now)).rejects.toThrow(
          'ProvisionedThroughputExceededException',
        )
      })

      test('expect Date.now used by default', async () => {
        const result = await incrementSpamSuggestionUsage(accountId, 20)

        expect(result).toBe(true)
      })
    })
  })

  describe('received', () => {
    describe('deleteReceivedById', () => {
      test('expect accountId and emailId passed to delete', async () => {
        await deleteReceivedById(accountId, emailId)

        expect(mockSend).toHaveBeenCalledWith({
          Key: {
            Account: {
              S: `${accountId}`,
            },
            MessageID: {
              S: `${emailId}`,
            },
          },
          TableName: 'received-table',
        })
      })
    })

    describe('getReceivedById', () => {
      beforeAll(() => {
        mockSend.mockResolvedValue({ Item: { Data: { S: JSON.stringify(account) } } })
      })

      // ConsistentRead matters here: emails-inbound-service writes the email and then, from a
      // different Lambda, asks this API to notify. An eventually-consistent read of that item can
      // miss it, and a missed notify is never retried.
      it('should pass accountId and emailId to a consistent get', async () => {
        await getReceivedById(accountId, emailId)

        expect(mockSend).toHaveBeenCalledWith({
          ConsistentRead: true,
          Key: {
            Account: {
              S: `${accountId}`,
            },
            MessageID: {
              S: `${emailId}`,
            },
          },
          TableName: 'received-table',
        })
      })

      it('should parse and return data', async () => {
        const result = await getReceivedById(accountId, emailId)

        expect(result).toEqual(account)
      })

      it('should throw error when item not found', async () => {
        mockSend.mockResolvedValueOnce({ Item: null })

        await expect(getReceivedById(accountId, emailId)).rejects.toThrow('Email not found')
      })
    })

    describe('getReceived', () => {
      beforeAll(() => {
        mockSend.mockResolvedValue({
          Items: [
            { Account: { S: `${accountId}` }, Data: { S: JSON.stringify(email) }, MessageID: { S: `${emailId}` } },
          ],
        })
      })

      test('expect data parsed and returned', async () => {
        const result = await getReceived(accountId)

        expect(result).toEqual([
          {
            accountId: 'account',
            data: {
              attachments: [
                {
                  filename: 'fnord.jpg',
                  id: '9ijh-6tfg-dfsf3-sdfio-johac',
                  size: 1976642,
                  type: 'image/jpeg',
                },
              ],
              bcc: ['bcc@domain.com'],
              cc: ['cc@domain.com'],
              from: 'another@domain.com',
              subject: 'Hello, world',
              timestamp: 1666560735998,
              to: ['account@domain.com'],
              viewed: false,
            },
            id: '7yh8g-7ytguy-98ui8u-5efka-87y87y',
          },
        ])
      })

      test('expect empty object with no data returned', async () => {
        mockSend.mockResolvedValueOnce({ Items: [] })
        const result = await getReceived(accountId)

        expect(result).toEqual([])
      })
    })

    describe('setReceivedById', () => {
      test('expect accountId, emailId, and data passed to put', async () => {
        await setReceivedById(accountId, emailId, email)

        expect(mockSend).toHaveBeenCalledWith({
          Item: {
            Account: {
              S: `${accountId}`,
            },
            Data: {
              S: JSON.stringify(email),
            },
            MessageID: {
              S: `${emailId}`,
            },
          },
          TableName: 'received-table',
        })
      })
    })
  })

  describe('sent', () => {
    describe('deleteSentById', () => {
      test('expect accountId and emailId passed to delete', async () => {
        await deleteSentById(accountId, emailId)

        expect(mockSend).toHaveBeenCalledWith({
          Key: {
            Account: {
              S: `${accountId}`,
            },
            MessageID: {
              S: `${emailId}`,
            },
          },
          TableName: 'sent-table',
        })
      })
    })

    describe('getSentById', () => {
      beforeAll(() => {
        mockSend.mockResolvedValue({ Item: { Data: { S: JSON.stringify(account) } } })
      })

      test('expect accountId and emailId passed to get', async () => {
        await getSentById(accountId, emailId)

        expect(mockSend).toHaveBeenCalledWith({
          Key: {
            Account: {
              S: `${accountId}`,
            },
            MessageID: {
              S: `${emailId}`,
            },
          },
          TableName: 'sent-table',
        })
      })

      test('expect data parsed and returned', async () => {
        const result = await getSentById(accountId, emailId)

        expect(result).toEqual(account)
      })

      it('should throw error when email not found', async () => {
        mockSend.mockResolvedValueOnce({ Item: null })

        await expect(getSentById(accountId, emailId)).rejects.toThrow('Email not found')
      })
    })

    describe('getSent', () => {
      beforeAll(() => {
        mockSend.mockResolvedValue({
          Items: [
            { Account: { S: `${accountId}` }, Data: { S: JSON.stringify(email) }, MessageID: { S: `${emailId}` } },
          ],
        })
      })

      test('expect data parsed and returned', async () => {
        const result = await getSent(accountId)

        expect(result).toEqual([
          {
            accountId: 'account',
            data: {
              attachments: [
                {
                  filename: 'fnord.jpg',
                  id: '9ijh-6tfg-dfsf3-sdfio-johac',
                  size: 1976642,
                  type: 'image/jpeg',
                },
              ],
              bcc: ['bcc@domain.com'],
              cc: ['cc@domain.com'],
              from: 'another@domain.com',
              subject: 'Hello, world',
              timestamp: 1666560735998,
              to: ['account@domain.com'],
              viewed: false,
            },
            id: '7yh8g-7ytguy-98ui8u-5efka-87y87y',
          },
        ])
      })

      test('expect empty object with no data returned', async () => {
        mockSend.mockResolvedValueOnce({ Items: [] })
        const result = await getSent(accountId)

        expect(result).toEqual([])
      })
    })

    describe('setSentById', () => {
      test('expect accountId, emailId, and data passed to put', async () => {
        await setSentById(accountId, emailId, email)

        expect(mockSend).toHaveBeenCalledWith({
          Item: {
            Account: {
              S: `${accountId}`,
            },
            Data: {
              S: JSON.stringify(email),
            },
            MessageID: {
              S: `${emailId}`,
            },
          },
          TableName: 'sent-table',
        })
      })
    })
  })
})
