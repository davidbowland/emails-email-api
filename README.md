# Lambda Emails API

Lambdas for emails API, which is the back-end for emails-ui.

## Setup

The `developer` role is required to deploy this project.

### Node / NPM

1. [Node](https://nodejs.org/en/)
1. [NPM](https://www.npmjs.com/)

### AWS Credentials

To run locally, [AWS CLI](https://aws.amazon.com/cli/) is required in order to assume a role with permission to update resources. Install AWS CLI with:

```brew
brew install awscli
```

If file `~/.aws/credentials` does not exist, create it and add a default profile:

```toml
[default]
aws_access_key_id=<YOUR_ACCESS_KEY_ID>
aws_secret_access_key=<YOUR_SECRET_ACCESS_KEY>
region=us-east-1
```

If necessary, generate a [new access key ID and secret access key](https://docs.aws.amazon.com/general/latest/gr/aws-sec-cred-types.html#access-keys-and-secret-access-keys).

Add a `developer` profile to the same credentials file:

```toml
[developer]
role_arn=arn:aws:iam::<account number>:role/developer
source_profile=default
mfa_serial=<YOUR_MFA_ARN>
region=us-east-1
```

If necessary, retrieve the ARN of the primary MFA device attached to the default profile:

```bash
aws iam list-mfa-devices --query 'MFADevices[].SerialNumber' --output text
```

## Developing Locally

### Unit Tests

[Jest](https://jestjs.io/) tests are run automatically on commit and push. If the test coverage threshold is not met, the push will fail. See `jest.config.ts` for coverage threshold.

Manually run tests with:

```bash
npm run test
```

### Prettier / Linter

Both [Prettier](https://prettier.io/) and [ESLint](https://eslint.org/) are executed on commit. Manually prettify and lint code with:

```bash
npm run lint
```

### Deploying to Production

When a pull request is merged into `master`, GitHub Actions (`.github/workflows/pipeline.yaml`) builds the Lambda functions with `sam build` (esbuild), packages them with `sam package`, and deploys with `sam deploy`.

In extreme cases, lambdas can be built and deployed locally with:

```bash
npm run deploy
```

## Infrastructure

Infrastructure specific to this API lives in this repo's `template.yaml`. Infrastructure shared across the `emails` project (Cognito, IAM, DNS) lives in the separate `emails-infrastructure` repo.

## Secrets

Application secrets live in SSM Parameter Store and are read at runtime by the Lambdas that need them. GitHub keeps only what is needed to authenticate a deploy.

| Path                                  | `-test` sibling                            | Type         | Read by                                      |
| ------------------------------------- | ------------------------------------------ | ------------ | -------------------------------------------- |
| `/emails/queue-api-key`               | `/emails-test/queue-api-key`               | SecureString | `emails-email-api`, `emails-inbound-service` |
| `/emails/emails-api-key`              | `/emails-test/emails-api-key`              | SecureString | `emails-inbound-service`                     |
| `/emails-email-api/vapid-public-key`  | `/emails-email-api-test/vapid-public-key`  | SecureString | `emails-email-api`                           |
| `/emails-email-api/vapid-private-key` | `/emails-email-api-test/vapid-private-key` | SecureString | `emails-email-api`                           |

The two API keys sit at shared `/emails/` paths on purpose: each is one credential used by more than one service, and a per-repo path would mean two places to edit on every rotation. Neither is a value anyone chooses — both are API Gateway keys issued to a stack in this account by SAM's `CreateUsagePlan: PER_API`, and `scripts/putSsmParameters.sh` copies them into SSM so the other services can read them:

| Path                     | Issued by                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `/emails/queue-api-key`  | the `emails-queue-api` stack                                                                         |
| `/emails/emails-api-key` | this repo's own stack — `emails-inbound-service` sends it as `x-api-key` on every call it makes here |

Nothing in the consuming repos writes either one. To read a value back by hand:

```bash
aws apigateway get-api-key --api-key <id> --include-value --region us-east-1 | jq -r .value
```

### Provisioning

**Parameters must exist before the first deploy of the stacks that read them, in this repo and in `emails-inbound-service`.** A stack whose parameters are missing deploys successfully and then fails on the first invocation.

Write everything for one environment:

```bash
./scripts/putSsmParameters.sh test
./scripts/putSsmParameters.sh prod
```

A normal run is answered entirely by AWS and needs no secret typed into it. The script reads each API key out of the stack that issued it, and generates a VAPID keypair when the environment has none.

The script prints the AWS account the current credentials belong to and waits for a yes before it writes anything — the parameter paths say `prod` or `test`, but nothing in them picks an account.

A prompt appears only where a lookup fails, which on a fresh environment means the stack issuing that key has not been deployed yet. That is also the only order that can work: the key does not exist until the stack does. So bring up a new environment by skipping the key (leave the prompt empty), deploying, then running the script again — leaving a prompt empty always leaves that parameter as it is, so rotating one secret never means retyping the others.

An environment holding exactly one half of a VAPID keypair is refused rather than repaired. Completing it means generating a new pair over the half already there, which is a rotation, so it goes through `--rotate-vapid` like any other.

Or write a single parameter by hand — with `--region`, because SSM parameters are region-scoped and one written outside `us-east-1` looks correct and is read by nothing:

```bash
aws ssm put-parameter --region us-east-1 --type SecureString --overwrite \
  --name /emails-email-api-test/vapid-public-key --value 'BN...'
```

A `SecureString` cannot be resolved by CloudFormation at deploy time (`{{resolve:ssm:…}}` handles `String` only), so the runtime-read machinery in `src/services/ssm.ts` is mandatory rather than chosen.

### Rotation

Each parameter is memoized per warm Lambda container and the cache never expires, so a rotated value does not reach a warm function. Rotate in this order:

1. Write the new value to SSM.
2. Force cold starts — redeploy the consuming stacks, or touch an environment variable.
3. Retire the old credential.

Rotating the **VAPID keypair invalidates every existing push subscription**. The UI's self-heal recovers browsers that still have notification permission granted; nobody else. Do not rotate it casually — the script refuses to overwrite a VAPID key that already exists unless you ask for it by name:

```bash
./scripts/putSsmParameters.sh prod --rotate-vapid
```

A rotation is the one case that still takes a pasted pair, because it is the one case where an operator has a specific pair in mind. Generate one with:

```bash
npx web-push generate-vapid-keys
```

It takes both halves in a single run: the script reads both prompts before it writes either parameter, and aborts without writing anything if only one arrives. A new public key stored beside the old private key breaks push for every device in the environment and nothing reports it — the push service rejects each send, no subscription is pruned, and the settings page still says notifications are on.

## Additional Documentation

- [AWS Lambda](https://aws.amazon.com/lambda/)

- [ESLint](https://eslint.org/)

- [Jest](https://jestjs.io/)

- [Prettier](https://prettier.io/)
