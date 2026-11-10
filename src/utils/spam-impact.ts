import {
  EmailBatch,
  EmailFolder,
  ParsedMail,
  SpamEmailImpactResult,
  SpamFolderCounts,
  SpamFolderImpact,
  SpamImpactCounts,
  SpamImpactEmail,
  SpamImpactRequest,
  SpamImpactResponse,
} from '../types'
import { sanitizeEmailText } from './email-text'
import { isValidBlockPhrase, SPAM_FILTER_MAX_ENTRIES, SPAM_FILTER_MAX_ENTRY_LENGTH } from './events'
import { createPhraseMatcher, toWords } from './phrase-matching'
import { getBodyParts, SUBJECT_MATCH_LENGTH } from './spam-body'

// The newest emails checked in each folder. The 4:1 ratio of these caps sets the read order, so a deadline cuts both
// folders about equally.
export const SPAM_IMPACT_INBOX_LIMIT = 100
export const SPAM_IMPACT_SPAM_LIMIT = 25
// Only the start of each raw email is downloaded. Message bodies come before attachments in normal MIME.
export const SPAM_IMPACT_BYTE_LIMIT = 262_144
// Emails read at once
export const SPAM_IMPACT_CONCURRENCY = 10
// No batch of reads starts after requestedAt + this. The 29-second Lambda timeout leaves 9 seconds for the last
// batch's parsing and the response.
export const SPAM_IMPACT_DEADLINE_MS = 20_000
export const SPAM_IMPACT_READ_TIMEOUT_MS = 3_000
export const SPAM_IMPACT_EMAILS_SHOWN = 5

const SHOWN_TEXT_LENGTH = 200
const EXCLUDE_EMAIL_ID_MAX_LENGTH = 256
const INBOX_PER_SPAM = SPAM_IMPACT_INBOX_LIMIT / SPAM_IMPACT_SPAM_LIMIT

// Emails stored before the spam filter carry no folder; they belong to the Inbox, as in get-all-emails.ts.
export const getEmailFolder = (email: EmailBatch): EmailFolder => email.data.folder ?? 'inbox'

export const countByFolder = (emails: EmailBatch[]): SpamFolderCounts => ({
  inbox: emails.filter((email) => getEmailFolder(email) === 'inbox').length,
  spam: emails.filter((email) => getEmailFolder(email) === 'spam').length,
})

// Newest first by timestamp, then by id so the order never depends on how the emails were loaded
const compareNewestFirst = (a: EmailBatch, b: EmailBatch): number =>
  b.data.timestamp - a.data.timestamp || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

const newestInFolder = (emails: EmailBatch[], folder: EmailFolder, limit: number): EmailBatch[] =>
  emails
    .filter((email) => getEmailFolder(email) === folder)
    .sort(compareNewestFirst)
    .slice(0, limit)

// 4 Inbox emails then 1 Spam email; when one folder runs out, the other continues alone
const interleave = (inbox: EmailBatch[], spam: EmailBatch[]): EmailBatch[] =>
  inbox.length === 0 || spam.length === 0
    ? [...inbox, ...spam]
    : [...inbox.slice(0, INBOX_PER_SPAM), spam[0], ...interleave(inbox.slice(INBOX_PER_SPAM), spam.slice(1))]

export const selectEmailsToCheck = (
  emails: EmailBatch[],
  excludeEmailId?: string,
): { readOrder: EmailBatch[]; totals: SpamFolderCounts } => {
  const candidates = emails.filter(({ id }) => id !== excludeEmailId)
  return {
    readOrder: interleave(
      newestInFolder(candidates, 'inbox', SPAM_IMPACT_INBOX_LIMIT),
      newestInFolder(candidates, 'spam', SPAM_IMPACT_SPAM_LIMIT),
    ),
    totals: countByFolder(candidates),
  }
}

const isString = (value: unknown): value is string => typeof value === 'string'

// The same rule as the inbound filter's classifyEmail: one matcher for the subject and one for each body part, and a
// phrase matches if any one of them matches, so a phrase never spans two parts. Attachments are never read.
export const matchesPhrases = (
  parsed: Pick<ParsedMail, 'subject' | 'text' | 'html'>,
  phraseWords: string[][],
): boolean[] => {
  const subject = isString(parsed.subject) ? parsed.subject.slice(0, SUBJECT_MATCH_LENGTH) : ''
  const matchers = [subject, ...getBodyParts(parsed as ParsedMail)].map((part) => createPhraseMatcher(toWords(part)))
  return phraseWords.map((words) => matchers.some((matcher) => matcher(words)))
}

// Cut by code point, so an emoji or other astral character is never split in half
const toShownText = (value: unknown): string =>
  isString(value) ? Array.from(sanitizeEmailText(value)).slice(0, SHOWN_TEXT_LENGTH).join('') : ''

const toImpactEmail = (email: EmailBatch): SpamImpactEmail => ({
  from: toShownText(email.data.from),
  id: email.id,
  subject: toShownText(email.data.subject),
})

const toFolderImpact = (results: SpamEmailImpactResult[], phraseIndex: number): SpamFolderImpact => {
  const matched = results.filter(({ matches }) => matches[phraseIndex])
  return {
    count: matched.length,
    emails: matched.slice(0, SPAM_IMPACT_EMAILS_SHOWN).map(({ email }) => toImpactEmail(email)),
  }
}

// results holds only the reads that succeeded, so each folder's checked count is its reads attempted minus those
// that failed or found no raw file. An email whose raw file is missing has nothing to check: it is left out of the
// folder's total and never makes the Inbox incomplete. Only failed and not-attempted Inbox reads do.
export const buildImpactResponse = (
  phrases: string[],
  results: SpamEmailImpactResult[],
  { failed, missing, notAttempted, totals }: SpamImpactCounts,
): SpamImpactResponse => {
  const sorted = [...results].sort((a, b) => compareNewestFirst(a.email, b.email))
  const inbox = sorted.filter(({ email }) => getEmailFolder(email) === 'inbox')
  const spam = sorted.filter(({ email }) => getEmailFolder(email) === 'spam')
  return {
    checked: {
      inbox: { checked: inbox.length, total: totals.inbox - missing.inbox },
      spam: { checked: spam.length, total: totals.spam - missing.spam },
    },
    inboxIncomplete: failed.inbox + notAttempted.inbox > 0,
    phrases: phrases.map((phrase, index) => ({
      inbox: toFolderImpact(inbox, index),
      phrase,
      spam: toFolderImpact(spam, index),
    })),
  }
}

// A missing raw file: S3 answers NoSuchKey, and the SDK may give a bare 404 as NotFound. Both need s3:ListBucket;
// without it a missing key is AccessDenied (403), which stays a failure. NoSuchBucket (also 404) is a failure too, so
// a misconfigured bucket never reads as "nothing to check".
export const isMissingObjectError = (error: unknown): boolean => {
  const { $metadata, name } = (error ?? {}) as { $metadata?: { httpStatusCode?: number }; name?: unknown }
  return name === 'NoSuchKey' || (name === 'NotFound' && $metadata?.httpStatusCode === 404)
}

// Only an error's name is ever logged, never its message or stack, which can quote a key, an address or the email.
// A name that is not a plain identifier becomes 'Unknown', so an odd thrown value cannot carry text into the log.
const LOGGABLE_ERROR_NAME = /^[A-Za-z][A-Za-z0-9]{0,63}$/

export const toLoggableErrorName = (error: unknown): string => {
  const name = (error as { name?: unknown } | null | undefined)?.name
  return typeof name === 'string' && LOGGABLE_ERROR_NAME.test(name) ? name : 'Unknown'
}

// How many failed reads had each error name, such as { NoSuchBucket: 1, TimeoutError: 2 }
export const countFailedReasons = (errorNames: string[]): Record<string, number> =>
  errorNames.reduce(
    (counts: Record<string, number>, name) => ({
      ...counts,
      [name]: (Object.hasOwn(counts, name) ? counts[name] : 0) + 1,
    }),
    {},
  )

const parseJsonObject = (body: string | undefined): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(body as string)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // Answered below with the same message as any other body that is not a JSON object
  }
  throw new Error('Request body must be a JSON object')
}

// The per-entry rules a block phrase must pass on account save. Like formatSpamFilter's messages, these never quote
// an entry.
const parsePhrases = (phrases: unknown): string[] => {
  if (!Array.isArray(phrases)) {
    throw new Error('phrases must be an array of strings')
  }
  if (phrases.length < 1 || phrases.length > SPAM_FILTER_MAX_ENTRIES) {
    throw new Error(`phrases must have 1 to ${SPAM_FILTER_MAX_ENTRIES} entries`)
  }
  if (!phrases.every(isString)) {
    throw new Error('phrases must be an array of strings')
  }
  if (!phrases.every((phrase) => phrase.length <= SPAM_FILTER_MAX_ENTRY_LENGTH)) {
    throw new Error(`phrases entries must be ${SPAM_FILTER_MAX_ENTRY_LENGTH} characters or fewer`)
  }
  if (!phrases.every(isValidBlockPhrase)) {
    throw new Error('phrases entries must contain at least one letter or number')
  }
  return [...phrases]
}

const parseExcludeEmailId = (excludeEmailId: unknown): { excludeEmailId?: string } => {
  if (excludeEmailId === undefined) {
    return {}
  }
  if (!isString(excludeEmailId) || excludeEmailId.length < 1 || excludeEmailId.length > EXCLUDE_EMAIL_ID_MAX_LENGTH) {
    throw new Error(`excludeEmailId must be a string of 1 to ${EXCLUDE_EMAIL_ID_MAX_LENGTH} characters`)
  }
  return { excludeEmailId }
}

// Throws an Error whose message is safe to answer with a 400
export const parseImpactRequest = (body: string | undefined): SpamImpactRequest => {
  const request = parseJsonObject(body)
  return {
    ...parseExcludeEmailId(request.excludeEmailId),
    phrases: parsePhrases(request.phrases),
  }
}
