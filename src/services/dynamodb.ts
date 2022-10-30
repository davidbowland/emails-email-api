import { DynamoDB } from 'aws-sdk'

import { Account, AccountBatch, Email, EmailBatch } from '../types'
import { dynamodbAccountsTableName, dynamodbReceivedTableName } from '../config'
import { xrayCapture } from '../utils/logging'

const dynamodb = xrayCapture(new DynamoDB({ apiVersion: '2012-08-10' }))

/* Accounts */

export const deleteAccountById = (account: string): Promise<DynamoDB.Types.DeleteItemOutput> =>
  dynamodb
    .deleteItem({
      Key: {
        Account: {
          S: `${account}`,
        },
      },
      TableName: dynamodbAccountsTableName,
    })
    .promise()

export const getAccountById = (account: string): Promise<Account> =>
  dynamodb
    .getItem({
      Key: {
        Account: {
          S: `${account}`,
        },
      },
      TableName: dynamodbAccountsTableName,
    })
    .promise()
    .then((response: any) => response.Item.Data.S)
    .then(JSON.parse)

const getAccountsFromScan = (response: DynamoDB.Types.ScanOutput): AccountBatch[] =>
  response.Items?.reduce(
    (result, item) => [...result, { data: JSON.parse(item.Data.S as string), id: item.Account.S as string }],
    [] as AccountBatch[]
  ) as AccountBatch[]

export const getAccounts = (): Promise<AccountBatch[]> =>
  dynamodb
    .scan({
      AttributesToGet: ['Data', 'Account'],
      TableName: dynamodbAccountsTableName,
    })
    .promise()
    .then((response: any) => getAccountsFromScan(response))

export const setAccountById = (account: string, data: Account): Promise<DynamoDB.Types.PutItemOutput> =>
  dynamodb
    .putItem({
      Item: {
        Account: {
          S: `${account}`,
        },
        Data: {
          S: JSON.stringify(data),
        },
      },
      TableName: dynamodbAccountsTableName,
    })
    .promise()

/* Received */

export const deleteReceivedById = (account: string, id: string): Promise<DynamoDB.Types.DeleteItemOutput> =>
  dynamodb
    .deleteItem({
      Key: {
        Account: {
          S: `${account}`,
        },
        MessageID: {
          S: `${id}`,
        },
      },
      TableName: dynamodbReceivedTableName,
    })
    .promise()

export const getReceivedById = (account: string, id: string): Promise<Email> =>
  dynamodb
    .getItem({
      Key: {
        Account: {
          S: `${account}`,
        },
        MessageID: {
          S: `${id}`,
        },
      },
      TableName: dynamodbReceivedTableName,
    })
    .promise()
    .then((response: any) => response.Item.Data.S)
    .then(JSON.parse)

const getReceivedFromScan = (response: DynamoDB.Types.ScanOutput): EmailBatch[] =>
  response.Items?.reduce(
    (result, item) => [
      ...result,
      { accountId: item.Account.S as string, data: JSON.parse(item.Data.S as string), id: item.MessageID.S as string },
    ],
    [] as EmailBatch[]
  ) as EmailBatch[]

export const getReceived = (account: string): Promise<EmailBatch[]> =>
  dynamodb
    .query({
      ExpressionAttributeNames: { '#d': 'Data' },
      ExpressionAttributeValues: {
        ':v1': {
          S: `${account}`,
        },
      },
      KeyConditionExpression: 'Account = :v1',
      ProjectionExpression: 'Account,MessageID,#d',
      TableName: dynamodbReceivedTableName,
    })
    .promise()
    .then((response: any) => getReceivedFromScan(response))

export const setReceivedById = (account: string, id: string, data: Email): Promise<DynamoDB.Types.PutItemOutput> =>
  dynamodb
    .putItem({
      Item: {
        Account: {
          S: `${account}`,
        },
        Data: {
          S: JSON.stringify(data),
        },
        MessageID: {
          S: `${id}`,
        },
      },
      TableName: dynamodbReceivedTableName,
    })
    .promise()
