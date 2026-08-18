import axios from 'axios'
import axiosRetry from 'axios-retry'

// Axios

axiosRetry(axios, { retries: 3 })

// API

export const queueApiUrl = process.env.QUEUE_API_URL as string

// DynamoDB

export const dynamodbAccountsTableName = process.env.DYNAMODB_ACCOUNTS_TABLE_NAME as string
export const dynamodbReceivedTableName = process.env.DYNAMODB_RECEIVED_TABLE_NAME as string
export const dynamodbSentTableName = process.env.DYNAMODB_SENT_TABLE_NAME as string

// Email

export const emailDomain = process.env.EMAIL_DOMAIN as string

// Environment

// Every environment-derived export here is `process.env.X as string`, so an absent variable becomes
// undefined, passes the type checker, and reaches an SDK call as `Name: undefined`. Handlers declare
// the manifest they need at module scope so the failure is a loud init error instead.
export const assertRequiredEnv = (...names: string[]): void => {
  const missing = names.filter((name) => !process.env[name])
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        `Add them to this function's Environment.Variables in template.yaml.`,
    )
  }
}

// JsonPatch

export const throwOnInvalidJsonPatch = true
export const mutateObjectOnJsonPatch = false

// Push

export const vapidSubject = process.env.VAPID_SUBJECT as string

// S3

export const emailBucket = process.env.EMAIL_BUCKET as string
export const maxUploadSize = process.env.MAX_UPLOAD_SIZE as string

// SSM

export const ssmQueueApiKeyPath = process.env.SSM_QUEUE_API_KEY_PATH as string
export const ssmVapidPrivateKeyPath = process.env.SSM_VAPID_PRIVATE_KEY_PATH as string
export const ssmVapidPublicKeyPath = process.env.SSM_VAPID_PUBLIC_KEY_PATH as string
