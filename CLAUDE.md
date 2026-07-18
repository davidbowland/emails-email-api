# emails-email-api

## General

**Always commit changes** after completing work unless explicitly told not to.

Use functional programming style where practical, including dependency injection, avoiding mutating objects or values, etc.

This repo is the back-end API for `emails-ui`: a collection of AWS Lambdas (fronted by both a REST API with `x-api-key` auth for the internal/service surface, and an HTTP API with Cognito JWT auth for user traffic) that manage email accounts and handle received/sent emails, with attachments and content stored in S3. Infrastructure shared across the `emails` project lives in the separate `emails-infrastructure` repo; most infrastructure specific to this API lives in this repo's own `template.yaml`.

## Code Layout

- `src/handlers/` — Lambda entry points, organized by domain (accounts, received emails, sent emails; `received/`/`sent/` further split into `attachments/` and `contents/`). Always catch exceptions and log with `logError` — never let exceptions bubble up from a handler.
- `src/services/` — clients for outside resources (axios, AWS SDK). Have side effects; only catch expected exceptions.
- `src/utils/` — shared, idempotent helper functions with no side effects. Pure functions should not catch exceptions.
- `src/config.ts` — all environment variables are read through here, never inline via `process.env` elsewhere. `jest.setup-test-env.js` must be kept in sync when adding/removing an environment variable.
- `src/types.ts` — all exported types/interfaces.
- `template.yaml` — the Lambda/API Gateway/DynamoDB definitions for this repo.
- `events/*.json` — one example API Gateway event per handler, used by tests.
- `__tests__/unit/__mocks__.ts` — shared/large mock data (typed where possible).
- `__tests__/tsconfig.json` — the live path-alias source (see Module Aliases below); update it when adding a new top-level directory under `src/`.

## Testing Standards

**Jest clears all mocks automatically** (`clearMocks: true` in jest.config.ts). Never manually clear mocks.

**Mock state:** Set shared defaults in `beforeAll`. Override per-test with `mockReturnValueOnce` / `mockResolvedValueOnce` / `mockRejectedValueOnce`. Never use `beforeEach` — write a named `setup()` function if repeated arrangement is needed and call it explicitly.

**Never use `jest.spyOn`.** Use `jest.mocked(fn)` for type-safe mocks instead.

**Every exported function gets its own `describe` block.**

**Non-determinism:** Any function that uses `Date.now()`, `Math.random()`, or `crypto.randomUUID()` to produce a value that affects test outcomes MUST accept it as an injectable parameter with a default:

```ts
// source
export const createThing = (input: Input, now = Date.now): Thing => ({ ...input, createdAt: now() })

// test
it('sets createdAt', () => {
  expect(createThing(input, () => 1_000_000).createdAt).toBe(1_000_000)
})
```

**Fake timers:** Use `jest.useFakeTimers()` in `beforeAll` (and `jest.useRealTimers()` in `afterAll`) when the code under test calls `setTimeout`, `setInterval`, or `Date` internally without injection.

**No `if` statements in tests.** No live `Date.now()` or `Math.random()` calls in test bodies. No date arithmetic that depends on the current wall-clock time.

**Deterministic above all.** A test that passes today and fails tomorrow is broken.

## Logging

Use the utilities in `src/utils/logging.ts`:

- `log()` — informational messages (processing steps, S3 uploads).
- `logError()` — exceptions that need admin attention; every Lambda's CloudWatch LogGroup has an `ERROR`-filter subscription to `log-subscriber`, so `logError` calls fan out to admin notification.
- **Never log PII or credentials directly.** Handlers log the inbound event via `log('Received event', redactEvent(event))` — `redactEvent` (in `src/utils/logging.ts`) strips the body, `Authorization`/`x-api-key` headers (in both `headers` and REST's `multiValueHeaders`), all JWT claims except `sub`, and the REST API's echoed `requestContext.identity.apiKey`. Never add a raw `log('...', event)` call that bypasses `redactEvent`.
- Wrap AWS SDK v3 clients with `xrayCapture()`; call `xrayCaptureHttps()` once before making external HTTPS calls (e.g. via axios) so they're traced.

## Security

**Bearer tokens and API keys are the sole access control** on this API's routes (Cognito JWT for the HTTP API, `x-api-key` for the REST/internal API). Never log their values (see Logging above). `validateUsernameInEvent` (`src/utils/events.ts`) bypasses per-account checks entirely for the internal REST domain — that surface is trusted only because the API key is the only thing gating it.

**Validate all external inputs** at API boundaries — schema, type, and length — before passing to downstream services.

**OWASP Top 10.** Primary exposure for this API: A01 Broken Access Control (token-as-sole-auth; the internal-domain bypass above), A03 Injection (NoSQL injection for DynamoDB; validate JSON Patch operations before applying — see `applyPatch` usage in the `patch-*` handlers), A05 Security Misconfiguration (IAM — avoid `Resource: "*"` and unnecessary actions; scope to specific ARNs; CFN parameters carrying secrets must have `NoEcho: true`).

## Module Aliases

| Alias         | Path             |
| ------------- | ---------------- |
| `@config`     | `src/config.ts`  |
| `@events/*`   | `events/*`       |
| `@handlers/*` | `src/handlers/*` |
| `@services/*` | `src/services/*` |
| `@types`      | `src/types.ts`   |
| `@utils/*`    | `src/utils/*`    |

Source files (`src/`) use relative imports; the aliases above are for test files only (defined in `__tests__/tsconfig.json` and mirrored in `jest.config.ts`'s `moduleNameMapper` — the root `tsconfig.json`'s `paths` are commented-out boilerplate, not the live source).

## Commands

- `npm test` — run tests with coverage
- `npm run typecheck` — TypeScript check
- `npm run lint` — format + lint
- `npm start` — run locally via SAM (`./scripts/runLocal.sh`)
