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
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb'

import {
  DEFAULT_SPAM_FILTER,
  dynamodbAccountsTableName,
  dynamodbPushSubscriptionsTableName,
  dynamodbReceivedTableName,
  dynamodbSentTableName,
  spamSuggestionUsageTableName,
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
// spamFilter is defaulted the same way, so accounts stored before the spam filter need no migration.
const normalizeLegacyAccount = (account: Partial<Account>): Account =>
  ({
    bounceSenders: [],
    notificationPreview: DEFAULT_NOTIFICATION_PREVIEW,
    spamFilter: DEFAULT_SPAM_FILTER,
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

// ConsistentRead because emails-inbound-service PUTs a received email through one Lambda and then
// immediately asks this API to notify from another. An eventually-consistent read served by a stale
// replica returns no item, post-notify treats that as 'Email not found' and answers 204, the caller
// treats any 2xx as success, and nothing retries -- the mail arrives and the phone stays silent,
// with no ERROR anywhere an operator would look. The cost is one extra RCU on a small single-item
// read; correctness on the notify path is worth more than that to every other caller as well, since
// patch-email and post-bounce read-modify-write the same item.
export const getReceivedById = async (account: string, id: string): Promise<Email> => {
  const command = new GetItemCommand({
    ConsistentRead: true,
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

/* Spam suggestion usage */

const DAY_MS = 86_400_000

const getUsageDay = (now: () => number): { day: string; dayStart: number } => {
  const dayStart = Math.floor(now() / DAY_MS) * DAY_MS
  return { day: new Date(dayStart).toISOString().slice(0, 10), dayStart }
}

// One item per account per UTC day, so the counter never shares an item with the account's Data:
// a PUT of the account (a full PutItem) cannot reset it. The increment and the limit check are a
// single conditional UpdateItem, so concurrent requests cannot both slip under the limit. Expires is
// the DynamoDB TTL attribute: two days past the start of the counted day, by which time the item can
// no longer be counted against.
// Returns false when the account has already used its daily limit; any other failure is rethrown.
export const incrementSpamSuggestionUsage = async (
  accountId: string,
  limit: number,
  now: () => number = Date.now,
): Promise<boolean> => {
  // A limit of zero, or a misconfigured NaN, allows nothing -- never a first call through
  // attribute_not_exists, and never a ValidationException surfacing as a 500.
  if (!(limit > 0)) {
    return false
  }
  const { day, dayStart } = getUsageDay(now)
  const expires = Math.floor((dayStart + 2 * DAY_MS) / 1000)
  const command = new UpdateItemCommand({
    ConditionExpression: 'attribute_not_exists(#count) OR #count < :limit',
    ExpressionAttributeNames: {
      '#count': 'Count',
      '#expires': 'Expires',
    },
    ExpressionAttributeValues: {
      ':expires': {
        N: `${expires}`,
      },
      ':limit': {
        N: `${limit}`,
      },
      ':one': {
        N: '1',
      },
    },
    Key: {
      Account: {
        S: `${accountId}`,
      },
      Day: {
        S: day,
      },
    },
    TableName: spamSuggestionUsageTableName,
    UpdateExpression: 'ADD #count :one SET #expires = :expires',
  })
  try {
    await dynamodb.send(command)
    return true
  } catch (error: unknown) {
    if ((error as Error)?.name === 'ConditionalCheckFailedException') {
      return false
    }
    throw error
  }
}

// Gives back one use when a counted request failed on our side, so an outage does not spend the
// account's daily allowance. Pass the same clock the increment used, so a request that straddles UTC
// midnight refunds the day it was counted against. The condition keeps the count from going below zero;
// a refund with nothing to refund (the item expired or was never written) is a no-op, not an error.
export const refundSpamSuggestionUsage = async (accountId: string, now: () => number = Date.now): Promise<void> => {
  const { day } = getUsageDay(now)
  const command = new UpdateItemCommand({
    ConditionExpression: '#count > :zero',
    ExpressionAttributeNames: {
      '#count': 'Count',
    },
    ExpressionAttributeValues: {
      ':minusOne': {
        N: '-1',
      },
      ':zero': {
        N: '0',
      },
    },
    Key: {
      Account: {
        S: `${accountId}`,
      },
      Day: {
        S: day,
      },
    },
    TableName: spamSuggestionUsageTableName,
    UpdateExpression: 'ADD #count :minusOne',
  })
  try {
    await dynamodb.send(command)
  } catch (error: unknown) {
    if ((error as Error)?.name !== 'ConditionalCheckFailedException') {
      throw error
    }
  }
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
