import axios from 'axios'
import axiosRetry from 'axios-retry'

// Axios

axiosRetry(axios, { retries: 3 })

// API

export const queueApiKey = process.env.QUEUE_API_KEY as string
export const queueApiUrl = process.env.QUEUE_API_URL as string

// DynamoDB

export const dynamodbAccountsTableName = process.env.DYNAMODB_ACCOUNTS_TABLE_NAME as string
export const dynamodbReceivedTableName = process.env.DYNAMODB_RECEIVED_TABLE_NAME as string
export const dynamodbSentTableName = process.env.DYNAMODB_SENT_TABLE_NAME as string

// Email

export const emailDomain = process.env.EMAIL_DOMAIN as string

// JsonPatch

export const throwOnInvalidJsonPatch = true
export const mutateObjectOnJsonPatch = false

// S3

export const emailBucket = process.env.EMAIL_BUCKET as string
export const maxUploadSize = process.env.MAX_UPLOAD_SIZE as string
