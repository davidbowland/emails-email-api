// API

export const apiUrl = process.env.API_URL as string

// DynamoDB

export const dynamodbAccountsTableName = process.env.DYNAMODB_ACCOUNTS_TABLE_NAME as string
export const dynamodbReceivedTableName = process.env.DYNAMODB_RECEIVED_TABLE_NAME as string

// JsonPatch

export const throwOnInvalidJsonPatch = true
export const mutateObjectOnJsonPatch = false

// S3

export const emailBucket = process.env.EMAIL_BUCKET as string
