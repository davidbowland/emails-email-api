// No imports: src/services/dynamodb.ts throws this error, and must not pull in the impact check's dependencies.

const SPAM_IMPACT_DEADLINE_ERROR_NAME = 'SpamImpactDeadlineError'

// Thrown by getAllReceived when the deadline passes while the email list is loading, before a page or during one.
// The message never quotes the request.
export const createSpamImpactDeadlineError = (): Error =>
  Object.assign(new Error('Spam impact check deadline reached'), { name: SPAM_IMPACT_DEADLINE_ERROR_NAME })

export const isSpamImpactDeadlineError = (error: unknown): boolean =>
  error instanceof Error && error.name === SPAM_IMPACT_DEADLINE_ERROR_NAME
