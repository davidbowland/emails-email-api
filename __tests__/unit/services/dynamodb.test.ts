import { account, accountId, email, emailId } from '../__mocks__'
import {
  deleteAccountById,
  deleteReceivedById,
  getAccountById,
  getAccounts,
  getReceived,
  getReceivedById,
  getSent,
  getSentById,
  setAccountById,
  setReceivedById,
  setSentById,
} from '@services/dynamodb'

const mockBatchGetItem = jest.fn()
const mockDeleteItem = jest.fn()
const mockGetItem = jest.fn()
const mockPutItem = jest.fn()
const mockQueryItem = jest.fn()
const mockScanTable = jest.fn()
jest.mock('aws-sdk', () => ({
  DynamoDB: jest.fn(() => ({
    batchGetItem: (...args) => ({ promise: () => mockBatchGetItem(...args) }),
    deleteItem: (...args) => ({ promise: () => mockDeleteItem(...args) }),
    getItem: (...args) => ({ promise: () => mockGetItem(...args) }),
    putItem: (...args) => ({ promise: () => mockPutItem(...args) }),
    query: (...args) => ({ promise: () => mockQueryItem(...args) }),
    scan: (...args) => ({ promise: () => mockScanTable(...args) }),
  })),
}))
jest.mock('@utils/logging', () => ({
  xrayCapture: jest.fn().mockImplementation((x) => x),
}))

describe('dynamodb', () => {
  describe('accounts', () => {
    describe('deleteAccountById', () => {
      test('expect accountId passed to delete', async () => {
        await deleteAccountById(accountId)
        expect(mockDeleteItem).toHaveBeenCalledWith({
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
        mockGetItem.mockResolvedValue({ Item: { Data: { S: JSON.stringify(account) } } })
      })

      test('expect accountId passed to get', async () => {
        await getAccountById(accountId)
        expect(mockGetItem).toHaveBeenCalledWith({
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
    })

    describe('getAccounts', () => {
      beforeAll(() => {
        mockScanTable.mockResolvedValue({
          Items: [{ Account: { S: `${accountId}` }, Data: { S: JSON.stringify(account) } }],
        })
      })

      test('expect data parsed and returned', async () => {
        const result = await getAccounts()
        expect(result).toEqual([{ data: { forwardTargets: ['any@domain.com'], name: 'Any' }, id: 'account' }])
      })

      test('expect empty object with no data returned', async () => {
        mockScanTable.mockResolvedValueOnce({ Items: [] })
        const result = await getAccounts()
        expect(result).toEqual([])
      })
    })

    describe('setAccountById', () => {
      test('expect accountId and data passed to put', async () => {
        await setAccountById(accountId, account)
        expect(mockPutItem).toHaveBeenCalledWith({
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

  describe('received', () => {
    describe('deleteReceivedById', () => {
      test('expect accountId and emailId passed to delete', async () => {
        await deleteReceivedById(accountId, emailId)
        expect(mockDeleteItem).toHaveBeenCalledWith({
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
        mockGetItem.mockResolvedValue({ Item: { Data: { S: JSON.stringify(account) } } })
      })

      test('expect accountId and emailId passed to get', async () => {
        await getReceivedById(accountId, emailId)
        expect(mockGetItem).toHaveBeenCalledWith({
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

      test('expect data parsed and returned', async () => {
        const result = await getReceivedById(accountId, emailId)
        expect(result).toEqual(account)
      })
    })

    describe('getReceived', () => {
      beforeAll(() => {
        mockQueryItem.mockResolvedValue({
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
        mockQueryItem.mockResolvedValueOnce({ Items: [] })
        const result = await getReceived(accountId)
        expect(result).toEqual([])
      })
    })

    describe('setReceivedById', () => {
      test('expect accountId, emailId, and data passed to put', async () => {
        await setReceivedById(accountId, emailId, email)
        expect(mockPutItem).toHaveBeenCalledWith({
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
    describe('getSentById', () => {
      beforeAll(() => {
        mockGetItem.mockResolvedValue({ Item: { Data: { S: JSON.stringify(account) } } })
      })

      test('expect accountId and emailId passed to get', async () => {
        await getSentById(accountId, emailId)
        expect(mockGetItem).toHaveBeenCalledWith({
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
    })

    describe('getSent', () => {
      beforeAll(() => {
        mockQueryItem.mockResolvedValue({
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
        mockQueryItem.mockResolvedValueOnce({ Items: [] })
        const result = await getSent(accountId)
        expect(result).toEqual([])
      })
    })

    describe('setSentById', () => {
      test('expect accountId, emailId, and data passed to put', async () => {
        await setSentById(accountId, emailId, email)
        expect(mockPutItem).toHaveBeenCalledWith({
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
