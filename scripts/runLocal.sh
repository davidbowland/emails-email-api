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
export DYNAMODB_PUSH_SUBSCRIPTIONS_TABLE_NAME=emails-email-api-push-subscriptions-test
export DYNAMODB_RECEIVED_TABLE_NAME=emails-email-api-received-test
export DYNAMODB_SENT_TABLE_NAME=emails-email-api-sent-test
export EMAIL_BUCKET=emails-service-storage-test
export QUEUE_API_URL=https://emails-queue-api.bowland.link/v1
export SSM_QUEUE_API_KEY_PATH=/emails-test/queue-api-key
export SSM_VAPID_PRIVATE_KEY_PATH=/emails-email-api-test/vapid-private-key
export SSM_VAPID_PUBLIC_KEY_PATH=/emails-email-api-test/vapid-public-key
export VAPID_SUBJECT=mailto:do-not-reply@bowland.link
sam local start-api --region=us-east-1 --force-image-build --parameter-overrides "Environment=test" --log-file local.log
