import { account, accountId, email, emailId, pushSubscription, pushSubscriptions } from '../__mocks__'
import {
  deleteAccountById,
  deletePushSubscriptionsById,
  deleteReceivedById,
  deleteSentById,
  getAccountById,
  getAccounts,
  getAllReceived,
  getPushSubscriptionsById,
  getReceived,
  getReceivedById,
  getSent,
  getSentById,
  incrementSpamSuggestionUsage,
  refundSpamSuggestionUsage,
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

    describe('refundSpamSuggestionUsage', () => {
      // 2026-10-21T13:45:00.000Z
      const now = () => 1_792_590_300_000

      beforeAll(() => {
        mockSend.mockResolvedValue({})
      })

      test('expect a conditional decrement of the same account and UTC day', async () => {
        await refundSpamSuggestionUsage(accountId, now)

        expect(mockSend).toHaveBeenCalledWith({
          ConditionExpression: '#count > :zero',
          ExpressionAttributeNames: {
            '#count': 'Count',
          },
          ExpressionAttributeValues: {
            ':minusOne': { N: '-1' },
            ':zero': { N: '0' },
          },
          Key: {
            Account: { S: accountId },
            Day: { S: '2026-10-21' },
          },
          TableName: 'spam-suggestion-usage-table',
          UpdateExpression: 'ADD #count :minusOne',
        })
      })

      test('expect the day to roll over at UTC midnight', async () => {
        await refundSpamSuggestionUsage(accountId, () => 1_792_627_199_999)
        await refundSpamSuggestionUsage(accountId, () => 1_792_627_200_000)

        expect(mockSend).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({ Key: { Account: { S: accountId }, Day: { S: '2026-10-21' } } }),
        )
        expect(mockSend).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ Key: { Account: { S: accountId }, Day: { S: '2026-10-22' } } }),
        )
      })

      test('expect no error when there is nothing to refund', async () => {
        mockSend.mockRejectedValueOnce(
          Object.assign(new Error('The conditional request failed'), { name: 'ConditionalCheckFailedException' }),
        )

        await expect(refundSpamSuggestionUsage(accountId, now)).resolves.toBeUndefined()
      })

      test('expect other errors rethrown', async () => {
        mockSend.mockRejectedValueOnce(new Error('ProvisionedThroughputExceededException'))

        await expect(refundSpamSuggestionUsage(accountId, now)).rejects.toThrow(
          'ProvisionedThroughputExceededException',
        )
      })

      test('expect Date.now used by default', async () => {
        await expect(refundSpamSuggestionUsage(accountId)).resolves.toBeUndefined()
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

      test('expect a single query even when more pages exist', async () => {
        mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: { Account: { S: accountId } } })
        await getReceived(accountId)

        expect(mockSend).toHaveBeenCalledTimes(1)
        expect(mockSend).toHaveBeenCalledWith({
          ExpressionAttributeNames: { '#d': 'Data' },
          ExpressionAttributeValues: { ':v1': { S: accountId } },
          KeyConditionExpression: 'Account = :v1',
          ProjectionExpression: 'Account,MessageID,#d',
          TableName: 'received-table',
        })
      })
    })

    describe('getAllReceived', () => {
      const toItem = (id: string) => ({
        Account: { S: accountId },
        Data: { S: JSON.stringify(email) },
        MessageID: { S: id },
      })
      const pageKey = (id: string) => ({ Account: { S: accountId }, MessageID: { S: id } })
      const query = {
        ExpressionAttributeNames: { '#d': 'Data' },
        ExpressionAttributeValues: { ':v1': { S: accountId } },
        KeyConditionExpression: 'Account = :v1',
        ProjectionExpression: 'Account,MessageID,#d',
        TableName: 'received-table',
      }
      const setupThreePages = () =>
        mockSend
          .mockResolvedValueOnce({ Items: [toItem('one'), toItem('two')], LastEvaluatedKey: pageKey('two') })
          .mockResolvedValueOnce({ Items: [toItem('three')], LastEvaluatedKey: pageKey('three') })
          .mockResolvedValueOnce({ Items: [toItem('four')] })

      const deadlineError = { message: 'Spam impact check deadline reached', name: 'SpamImpactDeadlineError' }
      const unabortedSignal = () => new AbortController().signal
      // A query that only settles when its abort signal fires, as the SDK does for a slow request
      const hangUntilAborted = (_: unknown, { abortSignal }: { abortSignal: AbortSignal }) =>
        new Promise((_resolve, reject) =>
          abortSignal.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          ),
        )

      test('expect items from every page, following LastEvaluatedKey', async () => {
        setupThreePages()
        const result = await getAllReceived(accountId, () => 5_000, unabortedSignal)

        expect(result.map(({ id }) => id)).toEqual(['one', 'two', 'three', 'four'])
        expect(result[0]).toEqual({ accountId, data: email, id: 'one' })
        expect(mockSend).toHaveBeenCalledTimes(3)
        expect(mockSend).toHaveBeenNthCalledWith(1, query, { abortSignal: expect.any(AbortSignal) })
        expect(mockSend).toHaveBeenNthCalledWith(
          2,
          { ...query, ExclusiveStartKey: pageKey('two') },
          { abortSignal: expect.any(AbortSignal) },
        )
        expect(mockSend).toHaveBeenNthCalledWith(
          3,
          { ...query, ExclusiveStartKey: pageKey('three') },
          { abortSignal: expect.any(AbortSignal) },
        )
      })

      test('expect each page to get a signal for the time left', async () => {
        setupThreePages()
        const timeLeft = jest.fn().mockReturnValueOnce(9_000).mockReturnValueOnce(6_000).mockReturnValueOnce(1)
        const signals = [new AbortController().signal, new AbortController().signal, new AbortController().signal]
        const createAbortSignal = jest
          .fn()
          .mockReturnValueOnce(signals[0])
          .mockReturnValueOnce(signals[1])
          .mockReturnValueOnce(signals[2])
        await getAllReceived(accountId, timeLeft, createAbortSignal)

        expect(createAbortSignal.mock.calls).toEqual([[9_000], [6_000], [1]])
        expect(mockSend.mock.calls.map(([, options]) => options.abortSignal)).toEqual(signals)
      })

      test('expect the deadline error when no time is left before page 2', async () => {
        mockSend.mockResolvedValueOnce({ Items: [toItem('one')], LastEvaluatedKey: pageKey('one') })
        const timeLeft = jest.fn().mockReturnValueOnce(100).mockReturnValue(0)

        await expect(getAllReceived(accountId, timeLeft, unabortedSignal)).rejects.toMatchObject(deadlineError)
        expect(mockSend).toHaveBeenCalledTimes(1)
        expect(timeLeft).toHaveBeenCalledTimes(2)
      })

      test.each([0, -50])('expect the deadline error and no query when %p ms are left at the start', async (left) => {
        await expect(getAllReceived(accountId, () => left, unabortedSignal)).rejects.toMatchObject(deadlineError)
        expect(mockSend).not.toHaveBeenCalled()
      })

      test('expect the deadline error when a page is cut off by its time limit', async () => {
        const controller = new AbortController()
        mockSend.mockImplementationOnce(hangUntilAborted)
        const pending = getAllReceived(
          accountId,
          () => 3_000,
          () => controller.signal,
        )
        controller.abort()

        await expect(pending).rejects.toMatchObject(deadlineError)
      })

      test('expect the default time limit to end a slow page', async () => {
        mockSend.mockImplementationOnce(hangUntilAborted)

        await expect(getAllReceived(accountId, () => 1)).rejects.toMatchObject(deadlineError)
      })

      test('expect an empty list when a page has no Items', async () => {
        mockSend.mockResolvedValueOnce({})

        await expect(getAllReceived(accountId, () => 5_000, unabortedSignal)).resolves.toEqual([])
      })

      test('expect reject when a query rejects', async () => {
        mockSend.mockRejectedValueOnce(new Error('ProvisionedThroughputExceededException'))

        await expect(getAllReceived(accountId, () => 5_000, unabortedSignal)).rejects.toThrow(
          'ProvisionedThroughputExceededException',
        )
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
