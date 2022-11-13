#!/usr/bin/env bash

# Stop immediately on error
set -e

if [[ -z "$1" ]]; then
  $(./scripts/assumeDeveloperRole.sh)
fi

# Only install production modules
export NODE_ENV=production

# Build the project
SAM_TEMPLATE=template.yaml
sam build --template ${SAM_TEMPLATE}

# Start the API locally
export API_URL='https://emails-email-api.bowland.link'
export DYNAMODB_ACCOUNTS_TABLE_NAME=emails-email-api-accounts-test
export DYNAMODB_RECEIVED_TABLE_NAME=emails-email-api-received-test
export DYNAMODB_SENT_TABLE_NAME=emails-email-api-sent-test
export EMAIL_BUCKET=emails-service-storage-test
export QUEUE_API_KEY=$(aws apigateway get-api-key --api-key a6d57eyf98 --include-value --region us-east-1 | jq -r .value)
export QUEUE_API_URL=https://emails-queue-api.bowland.link/v1
sam local start-api --region=us-east-1 --force-image-build --parameter-overrides "Environment=test QueueApiKey=$QUEUE_API_KEY" --log-file local.log
