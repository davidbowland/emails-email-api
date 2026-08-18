#!/usr/bin/env bash

# Provisions the SSM parameters the emails fleet reads at runtime.
#
# This repo owns the SHARED /emails/* paths as well as its own /emails-email-api/* paths. Other
# repos' READMEs link here; no other repo writes /emails/queue-api-key.
#
# Parameters must exist BEFORE the first deploy of the stacks that read them, or the stack comes up
# with Lambdas that throw on their first invocation.
#
# Usage:
#   ./scripts/putSsmParameters.sh prod
#   ./scripts/putSsmParameters.sh test

# Stop immediately on error
set -e

ENVIRONMENT=${1:-test}
REGION=us-east-1

if [[ "$ENVIRONMENT" == "prod" ]]; then
  SHARED_PREFIX=/emails
  API_PREFIX=/emails-email-api
else
  SHARED_PREFIX=/emails-test
  API_PREFIX=/emails-email-api-test
fi

put_secure_string() {
  local name=$1
  local value=$2
  aws ssm put-parameter --region "$REGION" --type SecureString --overwrite --name "$name" --value "$value" >/dev/null
  echo "wrote $name"
}

# The queue API key, shared with emails-inbound-service.
read -r -s -p "Queue API key for ${ENVIRONMENT}: " QUEUE_API_KEY
echo
put_secure_string "${SHARED_PREFIX}/queue-api-key" "$QUEUE_API_KEY"

# The VAPID keypair. Generate a new one with:
#   npx web-push generate-vapid-keys
# Rotating this invalidates EVERY existing push subscription, so it is not routine.
read -r -s -p "VAPID public key for ${ENVIRONMENT}: " VAPID_PUBLIC_KEY
echo
put_secure_string "${API_PREFIX}/vapid-public-key" "$VAPID_PUBLIC_KEY"

read -r -s -p "VAPID private key for ${ENVIRONMENT}: " VAPID_PRIVATE_KEY
echo
put_secure_string "${API_PREFIX}/vapid-private-key" "$VAPID_PRIVATE_KEY"

echo "Done. Force cold starts (redeploy the consuming stacks) before retiring any old credential."
