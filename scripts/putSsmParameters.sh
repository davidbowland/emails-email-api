#!/usr/bin/env bash

# Provisions the SSM parameters the emails fleet reads at runtime.
#
# This repo owns the SHARED /emails/* paths as well as its own /emails-email-api/* paths. Other
# repos' READMEs link here; no other repo writes a shared /emails/* value.
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

# Reads one secret into the variable named by $2 without writing anything, so a caller that needs
# two values can collect both before it commits to either.
read_secret() {
  local label=$1
  local target=$2
  local __secret
  read -r -s -p "${label} for ${ENVIRONMENT} (empty to skip): " __secret
  echo
  printf -v "$target" '%s' "$__secret"
}

# An empty answer skips the write rather than storing an empty string. Every prompt used to be
# answered on every run, so rotating the queue key meant retyping both VAPID keys from memory -- and
# a typo in the private key is silent: the sends still look fine and no device is reachable again.
prompt_and_put() {
  local name=$1
  local label=$2
  local value
  read_secret "$label" value
  if [[ -z "$value" ]]; then
    echo "skipped $name"
    return 0
  fi
  put_secure_string "$name" "$value"
}

# Overwriting a VAPID key that already exists takes an explicit --rotate-vapid, which routes to
# rotate_vapid_pair below instead. A browser binds each subscription to the applicationServerKey it
# was created with, so replacing the pair invalidates every push subscription in the environment and
# every device has to be re-subscribed by hand. That is not something to walk into through a prompt
# that looked like all the others.
put_vapid_key() {
  local name=$1
  local label=$2
  if aws ssm get-parameter --region "$REGION" --name "$name" >/dev/null 2>&1; then
    echo "skipped $name (already set; pass --rotate-vapid to replace it)"
    return 0
  fi
  prompt_and_put "$name" "$label"
}

# A rotation is the one case where the two keys are a single value in two parameters, so both are
# read before either is written. Writing them one prompt at a time leaves SSM holding a NEW public
# key beside the OLD private key whenever the operator pastes one and presses Enter on the other, or
# the terminal dies between the prompts -- and every layer then reads that state as healthy.
# sendNotification signs with a key that does not match the applicationServerKey every browser
# subscribed with, so push services answer 401/403; src/services/push.ts prunes only on 404/410, so
# no subscription is dropped; the browser's subscription is still non-null, so the UI's self-heal
# never fires; the settings page still says notifications are on. Push is dead for every device in
# the environment, with no alarm and nothing a user could notice beyond mail quietly not announcing
# itself. Two put-parameter calls still cannot be made atomic, but the window left is milliseconds
# of network rather than however long a person takes to find the other half of a keypair.
rotate_vapid_pair() {
  local public_name=$1
  local private_name=$2
  local public_value private_value

  if aws ssm get-parameter --region "$REGION" --name "$public_name" >/dev/null 2>&1 ||
    aws ssm get-parameter --region "$REGION" --name "$private_name" >/dev/null 2>&1; then
    echo "WARNING: replacing the VAPID keypair invalidates every push subscription in ${ENVIRONMENT}."
  fi

  read_secret "VAPID public key" public_value
  read_secret "VAPID private key" private_value

  if [[ -z "$public_value" && -z "$private_value" ]]; then
    echo "skipped $public_name"
    echo "skipped $private_name"
    return 0
  fi

  if [[ -z "$public_value" || -z "$private_value" ]]; then
    echo "ERROR: a VAPID rotation needs both keys. Nothing was written." >&2
    echo "Storing one half would leave a public key that does not match the private key, which breaks push for every device in ${ENVIRONMENT} without any error to show for it. Run again with both halves of the new pair." >&2
    exit 1
  fi

  put_secure_string "$public_name" "$public_value"
  put_secure_string "$private_name" "$private_value"
}

# The queue API key, shared with emails-inbound-service. Rotating this one is routine.
prompt_and_put "${SHARED_PREFIX}/queue-api-key" "Queue API key"

# This API's own key, read by emails-inbound-service to authenticate every call it makes here. This
# script is the only thing that writes it, and its absence is silent: the inbound Lambda catches the
# ParameterNotFound, logs it, and leaves the message in S3 unregistered, unforwarded, unbounced.
# Both keys are API Gateway keys; read one back with:
#   aws apigateway get-api-key --api-key <id> --include-value --region us-east-1 | jq -r .value
prompt_and_put "${SHARED_PREFIX}/emails-api-key" "Emails API key"

# The VAPID keypair. Generate a new one with:
#   npx web-push generate-vapid-keys
#
# First-time provisioning stays one prompt at a time: a public key written without its private key
# is loud, because the notify handler throws on the missing parameter and logError puts a 500 in
# front of an admin on the first email. It is only the rotation that can fail silently.
if [[ "$ROTATE_VAPID" == "true" ]]; then
  rotate_vapid_pair "${API_PREFIX}/vapid-public-key" "${API_PREFIX}/vapid-private-key"
else
  put_vapid_key "${API_PREFIX}/vapid-public-key" "VAPID public key"
  put_vapid_key "${API_PREFIX}/vapid-private-key" "VAPID private key"
fi

echo "Done. Force cold starts (redeploy the consuming stacks) before retiring any old credential."
