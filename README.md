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

Deploy this API before `emails-inbound-service`, and `emails-inbound-service` before `emails-ui`: the inbound service stores each email's `folder` and reads the account's `spamFilter` through this API, and the UI calls the folder and spam filter routes below.

## Infrastructure

Infrastructure specific to this API lives in this repo's `template.yaml`. Infrastructure shared across the `emails` project (Cognito, IAM, DNS) lives in the separate `emails-infrastructure` repo.

### Spam folder and spam filter

- **Folder.** A received email carries `folder` (`inbox` or `spam`); an email stored before the field existed has none and reads as `inbox`. `GET /v1/accounts/{accountId}/emails/received?folder=spam` lists one folder (default `inbox`; any other value is 400). `PATCH` on a received email may `replace` `/folder` with `inbox` or `spam` (other values are 400, other ops on `/folder` are 403), alongside the existing `/viewed`.
- **Spam filter.** An account carries `spamFilter: { blockPhrases, sensitivity, trustedSenders }`, defaulting to `{ blockPhrases: [], sensitivity: 'medium', trustedSenders: [] }` for accounts stored before it existed. `PATCH` may change `/spamFilter` as a whole or by member, but may not remove it; `move` and `copy` are refused on every path. A `PUT` without `spamFilter` keeps the stored one. Every save is validated: `sensitivity` is `low`, `medium` or `high`; each list has at most 100 entries of at most 100 characters; a block phrase needs a letter or digit; a trusted sender is an address, an `@domain` or a domain, and every domain needs a dot.

### Spam rule suggestions

`POST /v1/accounts/{accountId}/emails/received/{emailId}/spam-suggestions` (HTTP API, Cognito only — there is no `x-api-key` route, because the internal domain skips the ownership check) asks a model for stricter spam filter settings based on one received email. The UI calls it after a message is moved to Spam. It returns `{ suggestions: [{ id, kind, value, reason }] }` and never saves anything; accepted suggestions go through the normal validated account update.

| Status | When                                                                     |
| ------ | ------------------------------------------------------------------------ |
| 200    | Suggestions, possibly an empty list                                      |
| 403    | The caller does not own `accountId`                                      |
| 404    | The email or account does not exist                                      |
| 429    | The account has used its daily limit (`SPAM_SUGGESTION_DAILY_LIMIT`, 20) |
| 500    | Any other failure                                                        |
| 503    | Bedrock is denied (kill switch), throttling, unavailable or timed out    |

- **Stricter only.** The only kinds are `addBlockPhrase`, `removeTrustedSender` and `raiseSensitivity`. The email is untrusted and may try to steer the model, so `src/utils/spam-suggestions.ts` re-validates everything the model returns: unknown kinds are dropped, every entry must pass the same rules as an account save, sensitivity must go up, duplicates are dropped and at most 10 are returned. The rest of the checks are below.
- **What the model reads.** The body is up to 12,000 characters (`MAX_BODY_LENGTH`), taken from the HTML-derived text (`htmlToText` in `src/utils/spam-body.ts`) when there is any and from the text part otherwise. This matches what the viewer shows, so a stub text part no longer hides an HTML pitch. A cut inside a word drops that partial word. The body, subject, From and Reply-To go through `sanitizeEmailText` (`src/utils/email-text.ts`), which deletes invisible format characters (zero-width, bidi and tag characters) and replaces other control characters with a space.
- **Grounded in this email.**
  - A block phrase must match both the raw and the sanitized text of the subject or the body, because the inbound filter reads the raw email. Phrases under 3 characters (spaces not counted) are dropped.
  - A removed trusted sender must already be in the account's list and must match an address in the email's From or Return-Path headers, using the inbound filter's sender rules (`src/utils/sender-rules.ts`). A forged From can still name a trusted sender, because no authentication results are read here.
  - A reason that contains a link, a domain, an address, a phone number or markup is replaced with a fixed sentence for its kind, so the model cannot put a contact in front of the owner. A false positive only swaps in the fixed sentence.
- **Bedrock.** Calls go through `src/services/bedrock.ts` (Converse, `maxTokens` 1024, no thinking, a 20-second timeout per attempt and at most 2 attempts) with the model in `BEDROCK_MODEL_ID` (default Haiku 4.5, `us.anthropic.claude-haiku-4-5-20251001-v1:0`). The role may invoke any foundation model or inference profile, so the model can be changed through the environment variable alone. Logs carry the account id, message id, model id, token usage and suggestion count — never prompt or response text.
- **Kill switch.** The function's role attaches the fleet's `kill-switch-bedrock-${Environment}` managed policy. Flipping it makes every call fail with `AccessDeniedException`, which the endpoint answers with 503; the policy is the only spend cap on Bedrock.
- **Quota table.** `SpamSuggestionUsageTable` (`emails-email-api-spam-suggestion-usage[-test]`) holds one item per account per UTC day (`Account`, `Day`). A conditional `UpdateItem` increments `Count` only while it is under the limit, so concurrent calls cannot overshoot, and the counter never lives in the account item, so saving the account cannot reset it. DynamoDB TTL on `Expires` removes each item two days later. A request that fails with a 500 or 503 after it was counted gives its use back. The route is also throttled at a burst of 5 and 1 request per second.

### Spam phrase impact check

`POST /v1/accounts/{accountId}/spam-impact` shows which recent emails some block phrases would match, so the owner can judge a phrase before saving it. The UI calls it from the spam suggestions dialog and from Settings. It reads mail and returns counts and a few examples; it never saves or changes anything.

Request body: `{ phrases: string[], excludeEmailId?: string }`.

- `phrases` has 1 to 100 entries. Each entry passes the same rules as a block phrase on account save (at most 100 characters, at least one letter or digit after NFKC).
- `excludeEmailId`, if present, is a string of 1 to 256 characters. The UI sends the email it just moved to Spam, so the check leaves it out.

Response body:

```
{
  checked: { inbox: { checked, total }, spam: { checked, total } },
  inboxIncomplete: boolean,
  phrases: [{ phrase, inbox: { count, emails }, spam: { count, emails } }]
}
```

- `checked` counts the emails read in time. `total` counts the emails in the folder, not counting `excludeEmailId`.
- `inboxIncomplete` is true when a read failed or the deadline cut the reads short, so `inbox.checked` is below the smaller of `inbox.total` and 100.
- `phrases` has one entry per request phrase, in the same order, with `phrase` echoed as sent. `count` is every match among the emails checked. `emails` holds the newest 5 matches as `{ id, from, subject }`, with `from` and `subject` sanitized and cut to 200 characters.

| Status                          | When                                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| 200                             | The check ran. After failed reads or a passed deadline, `checked` is lower than expected |
| 400                             | The body is not a valid request                                                          |
| 403                             | The caller does not own `accountId`                                                      |
| 503 `{ code: 'CHECK_TIMEOUT' }` | The deadline passed while the email list was loading                                     |
| 500                             | Any other failure                                                                        |

- **Caps.** The check covers the newest 100 Inbox emails and the newest 25 Spam emails. It reads them in a 4:1 order (four Inbox emails, then one Spam email), so a deadline cuts both folders about equally. It downloads the first 256 KB of each raw email, and attachments are never matched. At most 5 matching emails are shown per phrase and folder.
- **Deadline.** The check stops at 20 seconds after the request arrives (`SPAM_IMPACT_DEADLINE_MS`). No page of the email list and no batch of 10 reads starts after that, and each read is also limited to 3 seconds. If the list has not finished loading, the answer is 503 `CHECK_TIMEOUT`. If reads stop early, the answer is 200 with a lower `checked`. The function timeout is 29 seconds, under the HTTP API's 30-second limit.
- **Matching follows the inbound filter.** A phrase matches when it matches the subject (first 1,024 characters) or any one body part, so it never spans two parts. Body parts come from `src/utils/spam-body.ts` and sender rules from `src/utils/sender-rules.ts`, which are identical copies of the code in `emails-inbound-service`. `__tests__/unit/spam-body-vectors.json` pins the behavior. `emails-inbound-service` holds the same file, a byte copy with the same SHA-256, and each repo's tests check the hash. Change both copies of the code, the vectors and both hashes together. Trusted senders are not removed from the check, because the filter's exemption depends on SPF and DMARC results that this check does not read, so a listed email may still pass the filter.
- **Access and cost.** The route is HTTP API only (Cognito), with no `x-api-key` route, because the internal domain skips the ownership check. It is throttled at a burst of 5 and 1 request per second, because each call makes up to 125 S3 reads. The function has no Bedrock permission, so mail read here cannot reach a model, and its role allows S3 `GetObject` only on `received/*`.
- **Logs.** One line per check with the account id, counts, duration and whether the deadline was reached. Phrases and email text are never logged, and errors are logged by name only.

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
