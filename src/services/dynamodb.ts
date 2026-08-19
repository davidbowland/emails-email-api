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

import {
  dynamodbAccountsTableName,
  dynamodbPushSubscriptionsTableName,
  dynamodbReceivedTableName,
  dynamodbSentTableName,
} from '../config'
import { Account, AccountBatch, DEFAULT_NOTIFICATION_PREVIEW, Email, EmailBatch, PushSubscription } from '../types'
import { xrayCapture } from '../utils/logging'

const dynamodb = xrayCapture(new DynamoDBClient({ apiVersion: '2012-08-10' }))

/* Accounts */

// The single place the default is applied on read, so every consumer receives a concrete value.
// This keeps DEFAULT_NOTIFICATION_PREVIEW while formatAccount (utils/events.ts) falls back to 'none'
// on the write path. That is intentional, not a drift: absent on READ means "this account predates
// the field and never chose", so the most informative tier is the right welcome, while absent on
// WRITE means "this client cannot express the choice" and must not overwrite a deliberate 'none'.
const normalizeLegacyAccount = (account: Partial<Account>): Account =>
  ({
    bounceSenders: [],
    notificationPreview: DEFAULT_NOTIFICATION_PREVIEW,
    ...account,
  }) as Account

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
  if (!response.Item?.Data?.S) {
    throw new Error('Account not found')
  }
  return normalizeLegacyAccount(JSON.parse(response.Item.Data.S))
}

const getAccountsFromScan = (response: ScanOutput): AccountBatch[] =>
  response.Items?.reduce(
    (result, item) => [
      ...result,
      { data: normalizeLegacyAccount(JSON.parse(item.Data.S as string)), id: item.Account.S as string },
    ],
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

/* Push subscriptions */

export const deletePushSubscriptionsById = async (account: string): Promise<DeleteItemOutput> => {
  const command = new DeleteItemCommand({
    Key: {
      Account: {
        S: `${account}`,
      },
    },
    TableName: dynamodbPushSubscriptionsTableName,
  })
  return dynamodb.send(command)
}

export const getPushSubscriptionsById = async (account: string): Promise<PushSubscription[]> => {
  const command = new GetItemCommand({
    Key: {
      Account: {
        S: `${account}`,
      },
    },
    TableName: dynamodbPushSubscriptionsTableName,
  })
  const response = await dynamodb.send(command)
  return response.Item?.Data?.S ? JSON.parse(response.Item.Data.S) : []
}

// When the array empties -- after the last DELETE or the last prune -- the item is deleted rather
// than stored as [], so the privacy policy's "until you turn notifications off" is literally true.
export const setPushSubscriptionsById = async (
  account: string,
  subscriptions: PushSubscription[],
): Promise<DeleteItemOutput | PutItemOutput> => {
  if (subscriptions.length === 0) {
    return deletePushSubscriptionsById(account)
  }
  const command = new PutItemCommand({
    Item: {
      Account: {
        S: `${account}`,
      },
      Data: {
        S: JSON.stringify(subscriptions),
      },
    },
    TableName: dynamodbPushSubscriptionsTableName,
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
  if (!response.Item?.Data?.S) {
    throw new Error('Email not found')
  }
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
  if (!response.Item?.Data?.S) {
    throw new Error('Email not found')
  }
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
