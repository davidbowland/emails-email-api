// API

process.env.QUEUE_API_KEY = 'queue-api-key'
process.env.QUEUE_API_URL = 'https://queue.api'

// DynamoDB

process.env.DYNAMODB_ACCOUNTS_TABLE_NAME = 'accounts-table'
process.env.DYNAMODB_RECEIVED_TABLE_NAME = 'received-table'
process.env.DYNAMODB_SENT_TABLE_NAME = 'sent-table'

// Email

process.env.EMAIL_DOMAIN = 'domain.com'

// S3

process.env.EMAIL_BUCKET = 'emails-service-storage'
process.env.MAX_UPLOAD_SIZE = '10000000'
