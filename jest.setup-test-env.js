// API

process.env.API_URL = 'https://emails-email-api.bowland.link/v1/emails'
process.env.QUEUE_API_KEY = 'queue-api-key'
process.env.QUEUE_API_URL = 'https://queue.api'

// DynamoDB

process.env.DYNAMODB_ACCOUNTS_TABLE_NAME = 'accounts-table'
process.env.DYNAMODB_RECEIVED_TABLE_NAME = 'received-table'
process.env.DYNAMODB_SENT_TABLE_NAME = 'sent-table'

// Email

process.env.EMAIL_DOMAIN = 'bowland.link'

// S3

process.env.EMAIL_BUCKET = 'emails-service-storage'
process.env.MAX_UPLOAD_SIZE = '10000000'

// SQS

process.env.SQS_MESSAGE_QUEUE_ID = 'message-queue-id'
process.env.SQS_QUEUE_URL = 'https://dbowland.com/sqsQueue'
