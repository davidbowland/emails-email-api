# Steering for emails-email-api

## Description

The repository is part of a larger project called `emails`. It is a collection of AWS Lambdas with associated resources that provide the back-end API for the emails-ui.

Its purpose is to manage email accounts and handle both received and sent emails. It provides CRUD operations for accounts, received emails, and sent emails, with support for attachments and content management through S3 storage.

## Code Layout

### src/handlers

- Entry points into the lambdas, organized by domain (accounts, received emails, sent emails)
- Always catch exceptions and log with `logError` - never let exceptions bubble up from handlers
- Subdirectories organize handlers by email type (received/, sent/) and functionality (attachments/, contents/)

### src/services

- Services that interact with outside resources
- axios and the AWS SDK prevents us from needing many clients
- Have side-effects
- Only catch expected exceptions

### src/utils

- Shared helper functions that are idempotent
- Have no side-effects
- Pure functions should not catch exceptions

### src/config.ts

- Shared repository configurations
- Environment variables should ALWAYS be read through config
- jest.setup-test-env.js also needs to be updated when updating environment variables

### src/types.ts

- ALL types or interfaces that are exported

### template.yaml

- Infrastructure unique to this repository
- Infrastructure shared in the `emails` project is located in a separate `emails-infrastructure` repository, but most infrastructure should be domain-specific
- See template.yaml for the Lambda function definitions that handle API Gateway and HTTP API events

### .github/workflows/pipeline.yaml

- Definition of the GitHub Actions deployment script for this repository

### events/\*.json

- Each handler has a json event file as an example of its input
- These files are used by tests

### __tests__/unit/**mocks**.ts

- Mock data that is either shared or too large to reasonably be within a test file (> 25 lines)
- Use typing, when possible, to ensure data is complete

### __tests__/unit/\*\*/\*\*\*

- Test files for all files in the src/ directory that are executable (excluding config and types)

### __tests__/tsconfig.json

- If adding a new directory within src/, `paths` in tsconfig need to be updated

## Rules for Development

- ALWAYS analyze existing patterns in the file and repository and follow them EXACTLY
- Use functional programming, when possible
- Use arrow functions
- **All exported functions must specify explicit types for all inputs and return values**
- Imports from within the repository should be relative (`../config`)
- When finished with changes, ALWAYS `npm run test` and ensure tests are passing with adequate coverage
- Use comments to explain WHY rather than WHAT, and use them sparingly

### Type Safety Requirements

```typescript
// All exported functions must have explicit types for parameters and return values:
export const getAccount = async (id: string): Promise<Account | null> => {
  // Implementation
}
```

### Logging Standards

Use the logging utilities from `src/utils/logging.ts`:

```typescript
// Logging Levels and Usage:
// - log(): For informational messages (S3 uploads, processing steps)
// - logWarn(): For recoverable issues (missing optional data, fallbacks)
// - logError(): For exceptions that require admin attention (sends text message)

// Examples:
log('Processing email request', { accountId, emailId, action: 'get' })
logWarn('Missing optional field', { accountId, field: 'displayName' })
logError('Failed to retrieve email', { accountId, emailId, error: error.message })

// NEVER log PII - use sanitized identifiers:
log('User action', { accountId: 'user123', action: 'forward' }) // Good
log('User action', { email: 'user@domain.com' }) // BAD - PII

// Always include context objects for structured logging
// Use X-Ray tracing for AWS service calls via xrayCapture()
```

### Error Handling Patterns

```typescript
// 1. Handler Level - Always catch and log, never throw:
export const handleSomething = async (event: SomeEvent): Promise<void> => {
  for (const record of event.Records) {
    try {
      await processSomething(record)
    } catch (error: unknown) {
      logError(error) // This sends admin notification
      // Continue processing other records
    }
  }
}

// 2. Utility Level - Pure functions should not catch:
export const parseEmail = (rawEmail: string): ParsedEmail => {
  // Let parsing errors bubble up naturally
  return mailparser.parse(rawEmail)
}
```

### X-Ray Tracing Patterns

```typescript
// Always wrap AWS clients with xrayCapture:
const s3 = xrayCapture(new S3Client({ apiVersion: '2006-03-01' }))

// Use xrayCaptureHttps for external HTTP calls:
xrayCaptureHttps()
const response = await axios.get(url) // Will be traced automatically
```

## Rules for Testing

- ALWAYS analyze existing patterns in the file and repository and follow them EXACTLY
- **ALL TESTS MUST BE DETERMINISTIC** (no randomness, conditionals, or time-dependent values)
- Use comments to explain WHY rather than WHAT, and use them sparingly
- Paths like `@handlers/` are defined in **tests**/tsconfig.json to access files in src/
- Every event from AWS should have a matching JSON file in events/ (if not, create one)
- Jest is configured to clear mocks after each test -- NEVER CALL jest.clearAllMocks()
- NEVER use beforeEach or afterEach -- use shared setup/teardown functions defined within the test and invoke them in each test
- EXCLUSIVELY use `mock...Once` in tests and `mock...` (without Once) in beforeAll
- Use jest.mocked for type-safe mocking
- NEVER use jest.spyOn
- Every exported function should be tested on its own with its own describe block

### Deterministic Testing Requirements

```typescript
// BAD - Non-deterministic:
const timestamp = Date.now()
const randomId = Math.random().toString()
const conditionalValue = Math.random() > 0.5 ? 'a' : 'b'

// GOOD - Deterministic:
const fixedTimestamp = 1640995200000 // Use fixed values
const testId = 'test-message-id-123'
const expectedValue = 'a' // Use consistent test data
```

### AWS SDK v3 Mocking Patterns

```typescript
// For AWS SDK v3 clients, mock the client constructor and commands:
const mockSend = jest.fn()
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({
    send: (...args) => mockSend(...args),
  })),
  GetObjectCommand: jest.fn().mockImplementation((x) => x),
  PutObjectCommand: jest.fn().mockImplementation((x) => x),
  CopyObjectCommand: jest.fn().mockImplementation((x) => x),
  DeleteObjectCommand: jest.fn().mockImplementation((x) => x),
  // Add other commands as needed
}))

// Always mock the xrayCapture utility:
jest.mock('@utils/logging', () => ({
  log: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
  xrayCapture: jest.fn().mockImplementation((x) => x),
}))

// In tests, use mockSend to control behavior:
beforeAll(() => {
  mockSend.mockResolvedValue({ Body: 'expected-result' })
})

// For specific test cases:
mockSend.mockResolvedValueOnce({
  /* specific response */
})
mockSend.mockRejectedValueOnce(new Error('AWS error'))
```

### Service Mocking Patterns

For mocking imports NOT initialized on load like other services:

```typescript
import * as myService from '@services/myService'

const result = { foo: 'bar' }

beforeAll(() => {
  jest.mocked(myService).fetchResult.mockResolvedValue(result)
})
```

For mocking imports initialized on load like axios:

```typescript
const mockPost = jest.fn()
jest.mock('axios', () => ({
  create: jest.fn().mockImplementation(() => ({
    post: (...args) => mockPost(...args),
  })),
}))
```
