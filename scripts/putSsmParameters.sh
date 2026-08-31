#!/usr/bin/env bash

# Provisions the SSM parameters the emails fleet reads at runtime.
#
# This repo owns the SHARED /emails/* paths as well as its own /emails-email-api/* paths. Other
# repos' READMEs link here; no other repo writes a shared /emails/* value.
#
# Parameters must exist BEFORE the first deploy of the stacks that read them, or the stack comes up
# with Lambdas that throw on their first invocation.
#
# Nothing here is typed by hand on a normal run. Both API keys are API Gateway keys owned by stacks
# in this account, so the script reads them back from those stacks; the VAPID pair is generated when
# the environment has none. A prompt only appears when a lookup fails, and leaving it empty leaves
# that parameter as it is -- rotating one secret never means retyping the others.
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

# The stacks that own the two API keys. emails-queue-api lives in another repo, but this script
# already owns the shared /emails/* path its key is written to, so the stack name belongs here too.
if [[ "$ENVIRONMENT" == "prod" ]]; then
  SHARED_PREFIX=/emails
  API_PREFIX=/emails-email-api
  EMAIL_STACK=emails-email-api
  QUEUE_STACK=emails-queue-api
else
  SHARED_PREFIX=/emails-test
  API_PREFIX=/emails-email-api-test
  EMAIL_STACK=emails-email-api-test
  QUEUE_STACK=emails-queue-api-test
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

# Reads a stack's own API Gateway key into the variable named by $2, or returns non-zero when it
# cannot. Both keys this script writes are issued by AWS rather than chosen by anyone, so asking an
# operator to paste one only invites a transcription error into a credential nothing validates.
#
# SAM's CreateUsagePlan: PER_API names the key <ApiLogicalId>ApiKey, hence ApiApiKey. The listing is
# a fallback in case that ever stops being true; it declines rather than guesses when a stack holds
# more than one key, because picking the wrong one writes a credential that authenticates nothing.
resolve_stack_api_key() {
  local stack=$1
  local target=$2
  local __key_id=''
  local __value=''

  __key_id=$(aws cloudformation describe-stack-resource --region "$REGION" \
    --stack-name "$stack" --logical-resource-id ApiApiKey \
    --query 'StackResourceDetail.PhysicalResourceId' --output text 2>/dev/null) || __key_id=''

  if [[ -z "$__key_id" || "$__key_id" == "None" ]]; then
    __key_id=$(aws cloudformation list-stack-resources --region "$REGION" --stack-name "$stack" \
      --query "StackResourceSummaries[?ResourceType=='AWS::ApiGateway::ApiKey'].PhysicalResourceId" \
      --output text 2>/dev/null) || __key_id=''
  fi

  if [[ -z "$__key_id" || "$__key_id" == "None" || "$__key_id" == *[[:space:]]* ]]; then
    return 1
  fi

  __value=$(aws apigateway get-api-key --region "$REGION" --api-key "$__key_id" \
    --include-value --query 'value' --output text 2>/dev/null) || __value=''

  if [[ -z "$__value" || "$__value" == "None" ]]; then
    return 1
  fi

  # The id is safe to print and says which stack answered; the value never is.
  echo "resolved from ${stack} (api key ${__key_id})"
  printf -v "$target" '%s' "$__value"
}

# A failed lookup is a fallback, not an error. On a fresh environment the stack that issues the key
# has not been deployed yet, so there is nothing to read and the operator has to paste it -- which is
# also the only order that works, since the key does not exist until the stack does.
resolve_or_prompt_and_put() {
  local name=$1
  local stack=$2
  local label=$3
  local value

  if resolve_stack_api_key "$stack" value; then
    put_secure_string "$name" "$value"
    return 0
  fi

  echo "Could not read the ${label} from ${stack}; deploy that stack first, or paste the value." >&2
  prompt_and_put "$name" "$label"
}

# Generates a keypair into the variables named by $1 and $2. web-push is a dependency of this repo,
# so --no-install keeps this to node_modules and fails loudly rather than pulling a package from the
# network to mint a production credential.
generate_vapid_pair() {
  local public_target=$1
  local private_target=$2
  local __generated __public __private

  if ! __generated=$(npx --no-install web-push generate-vapid-keys --json 2>/dev/null); then
    echo "ERROR: could not generate a VAPID keypair. Run npm ci and try again." >&2
    exit 1
  fi

  __public=$(printf '%s' "$__generated" | jq -r '.publicKey // empty')
  __private=$(printf '%s' "$__generated" | jq -r '.privateKey // empty')

  if [[ -z "$__public" || -z "$__private" ]]; then
    echo "ERROR: web-push returned output this script could not read as a keypair." >&2
    exit 1
  fi

  printf -v "$public_target" '%s' "$__public"
  printf -v "$private_target" '%s' "$__private"
}

# Replacing a VAPID key that already exists takes an explicit --rotate-vapid, which routes to
# rotate_vapid_pair below instead. A browser binds each subscription to the applicationServerKey it
# was created with, so replacing the pair invalidates every push subscription in the environment and
# every device has to be re-subscribed by hand. That is not something to walk into through a prompt
# that looked like all the others.
#
# An environment holding exactly one of the two is refused rather than repaired. Writing the missing
# half would mean minting a fresh pair and overwriting the existing key, which is a rotation -- and
# rotations go through the flag, whatever state led to them.
provision_vapid_pair() {
  local public_name=$1
  local private_name=$2
  local public_exists=false
  local private_exists=false

  if aws ssm get-parameter --region "$REGION" --name "$public_name" >/dev/null 2>&1; then
    public_exists=true
  fi
  if aws ssm get-parameter --region "$REGION" --name "$private_name" >/dev/null 2>&1; then
    private_exists=true
  fi

  if [[ "$public_exists" == true && "$private_exists" == true ]]; then
    echo "skipped $public_name (already set; pass --rotate-vapid to replace it)"
    echo "skipped $private_name (already set; pass --rotate-vapid to replace it)"
    return 0
  fi

  if [[ "$public_exists" == true || "$private_exists" == true ]]; then
    echo "ERROR: ${ENVIRONMENT} holds one half of a VAPID keypair. Nothing was written." >&2
    echo "Completing it means generating a new pair over the half that is there, which invalidates every push subscription in ${ENVIRONMENT}. Run again with --rotate-vapid to say that is what you want." >&2
    exit 1
  fi

  local public_value private_value
  generate_vapid_pair public_value private_value
  put_secure_string "$public_name" "$public_value"
  put_secure_string "$private_name" "$private_value"
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

  echo "Generate a pair with: npx web-push generate-vapid-keys"
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

# The queue API key: emails-queue-api's own key, sent by this API and by emails-inbound-service.
# Rotating this one is routine.
resolve_or_prompt_and_put "${SHARED_PREFIX}/queue-api-key" "$QUEUE_STACK" "Queue API key"

# This API's own key, read by emails-inbound-service to authenticate every call it makes here. This
# script is the only thing that writes it, and its absence is silent: the inbound Lambda catches the
# ParameterNotFound, logs it, and leaves the message in S3 unregistered, unforwarded, unbounced.
resolve_or_prompt_and_put "${SHARED_PREFIX}/emails-api-key" "$EMAIL_STACK" "Emails API key"

# The VAPID keypair. An environment with neither key gets a freshly generated pair; nobody outside
# this API ever needs to know either half, so there is nothing to bring from elsewhere. A rotation
# still takes a pasted pair, because that is where an operator has a specific pair in mind.
if [[ "$ROTATE_VAPID" == "true" ]]; then
  rotate_vapid_pair "${API_PREFIX}/vapid-public-key" "${API_PREFIX}/vapid-private-key"
else
  provision_vapid_pair "${API_PREFIX}/vapid-public-key" "${API_PREFIX}/vapid-private-key"
fi

echo "Done. Force cold starts (redeploy the consuming stacks) before retiring any old credential."
