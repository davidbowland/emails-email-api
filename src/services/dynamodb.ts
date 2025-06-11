import {
  DeleteItemCommand,
  DeleteItemOutput,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  PutItemOutput,
  QueryCommand,
  ScanCommand,
  ScanOutput,
} from '@aws-sdk/client-dynamodb'

import { dynamodbAccountsTableName, dynamodbReceivedTableName, dynamodbSentTableName } from '../config'
import { Account, AccountBatch, Email, EmailBatch } from '../types'
import { xrayCapture } from '../utils/logging'

const dynamodb = xrayCapture(new DynamoDBClient({ apiVersion: '2012-08-10' }))

/* Accounts */

export const deleteAccountById = async (account: string): Promise<DeleteItemOutput> => {
  const command = new DeleteItemCommand({
    Key: {
      Account: {
        S: `${account}`,
      },
    },
    TableName: dynamodbAccountsTableName,
  })
  return dynamodb.send(command)
}

export const getAccountById = async (account: string): Promise<Account> => {
  const command = new GetItemCommand({
    Key: {
      Account: {
        S: `${account}`,
      },
    },
    TableName: dynamodbAccountsTableName,
  })
  const response = await dynamodb.send(command)
  return JSON.parse(response.Item.Data.S)
}

const getAccountsFromScan = (response: ScanOutput): AccountBatch[] =>
  response.Items?.reduce(
    (result, item) => [...result, { data: JSON.parse(item.Data.S as string), id: item.Account.S as string }],
    [] as AccountBatch[],
  ) as AccountBatch[]

export const getAccounts = async (): Promise<AccountBatch[]> => {
  const command = new ScanCommand({
    AttributesToGet: ['Data', 'Account'],
    TableName: dynamodbAccountsTableName,
  })
  const response = await dynamodb.send(command)
  return getAccountsFromScan(response)
}

export const setAccountById = async (account: string, data: Account): Promise<PutItemOutput> => {
  const command = new PutItemCommand({
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
  return dynamodb.send(command)
}

/* Received */

export const deleteReceivedById = async (account: string, id: string): Promise<DeleteItemOutput> => {
  const command = new DeleteItemCommand({
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
  return dynamodb.send(command)
}

export const getReceivedById = async (account: string, id: string): Promise<Email> => {
  const command = new GetItemCommand({
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
  const response = await dynamodb.send(command)
  return JSON.parse(response.Item.Data.S)
}

const getReceivedFromScan = (response: ScanOutput): EmailBatch[] =>
  response.Items?.reduce(
    (result, item) => [
      ...result,
      { accountId: item.Account.S as string, data: JSON.parse(item.Data.S as string), id: item.MessageID.S as string },
    ],
    [] as EmailBatch[],
  ) as EmailBatch[]

export const getReceived = async (account: string): Promise<EmailBatch[]> => {
  const command = new QueryCommand({
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
  const response = await dynamodb.send(command)
  return getReceivedFromScan(response)
}

export const setReceivedById = async (account: string, id: string, data: Email): Promise<PutItemOutput> => {
  const command = new PutItemCommand({
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
  return dynamodb.send(command)
}

/* Sent */

export const deleteSentById = async (account: string, id: string): Promise<DeleteItemOutput> => {
  const command = new DeleteItemCommand({
    Key: {
      Account: {
        S: `${account}`,
      },
      MessageID: {
        S: `${id}`,
      },
    },
    TableName: dynamodbSentTableName,
  })
  return dynamodb.send(command)
}

export const getSentById = async (account: string, id: string): Promise<Email> => {
  const command = new GetItemCommand({
    Key: {
      Account: {
        S: `${account}`,
      },
      MessageID: {
        S: `${id}`,
      },
    },
    TableName: dynamodbSentTableName,
  })
  const response = await dynamodb.send(command)
  return JSON.parse(response.Item.Data.S)
}

const getSentFromScan = (response: ScanOutput): EmailBatch[] =>
  response.Items?.reduce(
    (result, item) => [
      ...result,
      { accountId: item.Account.S as string, data: JSON.parse(item.Data.S as string), id: item.MessageID.S as string },
    ],
    [] as EmailBatch[],
  ) as EmailBatch[]

export const getSent = async (account: string): Promise<EmailBatch[]> => {
  const command = new QueryCommand({
    ExpressionAttributeNames: { '#d': 'Data' },
    ExpressionAttributeValues: {
      ':v1': {
        S: `${account}`,
      },
    },
    KeyConditionExpression: 'Account = :v1',
    ProjectionExpression: 'Account,MessageID,#d',
    TableName: dynamodbSentTableName,
  })
  const response = await dynamodb.send(command)
  return getSentFromScan(response)
}

export const setSentById = async (account: string, id: string, data: Email): Promise<PutItemOutput> => {
  const command = new PutItemCommand({
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
    TableName: dynamodbSentTableName,
  })
  return dynamodb.send(command)
}
