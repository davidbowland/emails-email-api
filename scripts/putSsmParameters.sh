#!/usr/bin/env bash

# Provisions the SSM parameters the emails fleet reads at runtime.
#
# This repo owns the SHARED /emails/* paths as well as its own /emails-email-api/* paths. Other
# repos' READMEs link here; no other repo writes /emails/queue-api-key.
#
# Parameters must exist BEFORE the first deploy of the stacks that read them, or the stack comes up
# with Lambdas that throw on their first invocation.
#
# Leave a prompt empty to leave that parameter as it is. Rotating one secret never means retyping
# the others.
#
# Usage:
#   ./scripts/putSsmParameters.sh prod
#   ./scripts/putSsmParameters.sh test
#   ./scripts/putSsmParameters.sh prod --rotate-vapid

# Stop immediately on error
set -e

REGION=us-east-1
ENVIRONMENT=
ROTATE_VAPID=false

usage() {
  echo "Usage: $0 (prod|test) [--rotate-vapid]" >&2
  exit 1
}

# The environment is required rather than defaulted. A bare run used to mean "test", which reads as
# a safe default right up until somebody passes a flag and forgets the environment.
for arg in "$@"; do
  case "$arg" in
    --rotate-vapid) ROTATE_VAPID=true ;;
    prod | test) ENVIRONMENT=$arg ;;
    *)
      echo "Unknown argument: $arg" >&2
      usage
      ;;
  esac
done

if [[ -z "$ENVIRONMENT" ]]; then
  usage
fi

if [[ "$ENVIRONMENT" == "prod" ]]; then
  SHARED_PREFIX=/emails
  API_PREFIX=/emails-email-api
else
  SHARED_PREFIX=/emails-test
  API_PREFIX=/emails-email-api-test
fi

# Nothing in the path prefixes selects an AWS account. Running this with test credentials writes
# prod-NAMED parameters into the test account, where they look correct and are read by nothing,
# while the prod stacks keep failing on a parameter that appears to exist. Print who these
# credentials are and get an answer before the first write.
echo "About to write ${ENVIRONMENT} parameters under ${SHARED_PREFIX} and ${API_PREFIX} in ${REGION}, as:"
aws sts get-caller-identity --output text --query '[Account,Arn]'
read -r -p "Is that the right account? [y/N] " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "Aborted. Nothing written."
  exit 1
fi

# Values reach the CLI through a private file rather than --value, which would put a secret in this
# process's argv where any local `ps` can read it. jq builds the JSON, so a value carrying a quote
# or a backslash cannot corrupt the request.
SSM_INPUT_FILE=$(mktemp "${TMPDIR:-/tmp}/emails-ssm.XXXXXX")
chmod 600 "$SSM_INPUT_FILE"
trap 'rm -f "$SSM_INPUT_FILE"' EXIT

put_secure_string() {
  local name=$1
  local value=$2
  printf '%s' "$value" |
    jq -Rs --arg name "$name" '{Name: $name, Value: ., Type: "SecureString", Overwrite: true}' >"$SSM_INPUT_FILE"
  aws ssm put-parameter --region "$REGION" --cli-input-json "file://$SSM_INPUT_FILE" >/dev/null
  echo "wrote $name"
}

# An empty answer skips the write rather than storing an empty string. Every prompt used to be
# answered on every run, so rotating the queue key meant retyping both VAPID keys from memory -- and
# a typo in the private key is silent: the sends still look fine and no device is reachable again.
prompt_and_put() {
  local name=$1
  local label=$2
  local value
  read -r -s -p "${label} for ${ENVIRONMENT} (empty to skip): " value
  echo
  if [[ -z "$value" ]]; then
    echo "skipped $name"
    return 0
  fi
  put_secure_string "$name" "$value"
}

# Overwriting a VAPID key that already exists takes an explicit --rotate-vapid. A browser binds each
# subscription to the applicationServerKey it was created with, so replacing the pair invalidates
# every push subscription in the environment and every device has to be re-subscribed by hand. That
# is not something to walk into through a prompt that looked like all the others.
put_vapid_key() {
  local name=$1
  local label=$2
  if aws ssm get-parameter --region "$REGION" --name "$name" >/dev/null 2>&1; then
    if [[ "$ROTATE_VAPID" != "true" ]]; then
      echo "skipped $name (already set; pass --rotate-vapid to replace it)"
      return 0
    fi
    echo "WARNING: replacing $name invalidates every push subscription in ${ENVIRONMENT}."
  fi
  prompt_and_put "$name" "$label"
}

# The queue API key, shared with emails-inbound-service. Rotating this one is routine.
prompt_and_put "${SHARED_PREFIX}/queue-api-key" "Queue API key"

# The VAPID keypair. Generate a new one with:
#   npx web-push generate-vapid-keys
put_vapid_key "${API_PREFIX}/vapid-public-key" "VAPID public key"
put_vapid_key "${API_PREFIX}/vapid-private-key" "VAPID private key"

echo "Done. Force cold starts (redeploy the consuming stacks) before retiring any old credential."
