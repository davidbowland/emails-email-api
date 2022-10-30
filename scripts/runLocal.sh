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
export EMAIL_BUCKET=emails-service-storage-test
sam local start-api --region=us-east-1 --force-image-build --log-file local.log
