import { account, accountId, email, emailId } from '../__mocks__'
import {
  deleteAccountById,
  deleteReceivedById,
  deleteSentById,
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
}))
jest.mock('@utils/logging', () => ({
  xrayCapture: jest.fn().mockImplementation((x) => x),
}))

describe('dynamodb', () => {
  describe('accounts', () => {
    describe('deleteAccountById', () => {
      test('expect accountId passed to delete', async () => {
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
    })

    describe('getAccounts', () => {
      beforeAll(() => {
        mockSend.mockResolvedValue({
          Items: [{ Account: { S: `${accountId}` }, Data: { S: JSON.stringify(account) } }],
        })
      })

      test('expect data parsed and returned', async () => {
        const result = await getAccounts()

        expect(result).toEqual([{ data: { forwardTargets: ['any@domain.com'], name: 'Any' }, id: 'account' }])
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

      test('expect accountId and emailId passed to get', async () => {
        await getReceivedById(accountId, emailId)

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

      test('expect data parsed and returned', async () => {
        const result = await getReceivedById(accountId, emailId)

        expect(result).toEqual(account)
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
