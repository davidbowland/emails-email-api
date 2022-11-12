// API

process.env.API_URL = 'https://emails-email-api.bowland.link/v1/emails'

// DynamoDB

process.env.DYNAMODB_ACCOUNTS_TABLE_NAME = 'accounts-table'
process.env.DYNAMODB_RECEIVED_TABLE_NAME = 'received-table'

// S3

process.env.EMAIL_BUCKET = 'emails-service-storage'

// SQS

process.env.SQS_MESSAGE_QUEUE_ID = 'message-queue-id'
process.env.SQS_QUEUE_URL = 'https://dbowland.com/sqsQueue'
