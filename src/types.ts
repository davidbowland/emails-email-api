// These re-exports must be `export type`: this module now also exports runtime constants, so it is
// emitted as a real module rather than erased, and `aws-lambda` is a types-only package with nothing
// to require at runtime.
export type * from 'aws-lambda'
export type { AxiosResponse } from 'axios'
export type { ParsedMail } from 'mailparser'
export type { Operation as PatchOperation } from 'fast-json-patch'
export type { PushSubscription } from 'web-push'

export interface StringObject {
  [key: string]: string
}

// Attachments

export interface AttachmentCommon {
  checksum: string
  cid?: string
  content: Buffer | { data: number[]; type: string }
  contentDisposition: string
  contentId?: string
  contentType: string
  filename?: string
  headerLines: Record<string, string>
  headers: StringObject
  related?: boolean
  size: number
  type: 'attachment'
}

export interface AttachmentContents {
  body: Buffer
  metadata?: Record<string, string>
}

// Accounts

export type NotificationPreview = 'sender-and-subject' | 'sender-only' | 'none'

export const NOTIFICATION_PREVIEWS: NotificationPreview[] = ['sender-and-subject', 'sender-only', 'none']

export const DEFAULT_NOTIFICATION_PREVIEW: NotificationPreview = 'sender-and-subject'

export type SpamSensitivity = 'low' | 'medium' | 'high'

export interface SpamFilter {
  blockPhrases: string[]
  sensitivity: SpamSensitivity
  trustedSenders: string[]
}

export interface Account {
  bounceSenders: string[]
  forwardTargets: string[]
  name: string
  notificationPreview: NotificationPreview
  spamFilter: SpamFilter
}

export interface AccountBatch {
  data: Account
  id: string
}

// Emails

export interface EmailAttachment {
  filename: string
  id: string
  size: number
  type: string
}

export type EmailFolder = 'inbox' | 'spam'

export interface Email {
  attachments?: EmailAttachment[]
  bcc?: string[]
  bounced?: boolean
  cc?: string[]
  // Absent on every email stored before the spam filter existed; absent reads as 'inbox'.
  folder?: EmailFolder
  from: string
  subject: string
  timestamp: number
  to: string[]
  viewed: boolean
}

export interface EmailAddress {
  address: string
  name: string
}

export interface EmailAddressParsed {
  html: string
  text: string
  value: EmailAddress[]
}

export interface EmailAddressReplyTo {
  display: string
  value: {
    address: string
    group?: string[]
    name: string
  }[]
}

export interface EmailBatch {
  accountId: string
  data: Email
  id: string
}

export interface EmailHeaders {
  [key: string]: string
}

export interface EmailContents {
  attachments?: EmailAttachment[]
  bccAddress?: EmailAddressParsed
  bodyHtml: string
  bodyText: string
  ccAddress?: EmailAddressParsed
  date?: string
  fromAddress: EmailAddressParsed
  headers: EmailHeaders
  id: string
  inReplyTo?: string
  references: string[]
  replyToAddress: EmailAddressReplyTo
  subject?: string
  toAddress?: EmailAddressParsed
}

export interface EmailOutbound {
  attachments?: AttachmentCommon[]
  bcc?: EmailAddress[]
  cc?: EmailAddress[]
  from: EmailAddress
  headers?: StringObject
  html: string
  inReplyTo?: string
  references?: string[]
  replyTo: EmailAddress
  sender: EmailAddress
  subject: string
  text: string
  to: EmailAddress[]
}

// Spam suggestions

// Every kind only ever tightens the filter: a suggestion derived from a hostile email must not be
// able to loosen it.
export type SpamSuggestionKind = 'addBlockPhrase' | 'removeTrustedSender' | 'raiseSensitivity'

export interface SpamSuggestion {
  id: string
  kind: SpamSuggestionKind
  reason: string
  value: string
}

// Spam impact

export interface SpamFolderCounts {
  inbox: number
  spam: number
}

// One email read successfully, with one match flag per request phrase
export interface SpamEmailImpactResult {
  email: EmailBatch
  matches: boolean[]
}

export interface SpamImpactRequest {
  excludeEmailId?: string // an email to leave out, such as the one just moved to Spam
  phrases: string[]
}

export interface SpamImpactEmail {
  from: string // Email.from, sanitized, cut to 200 characters
  id: string
  subject: string // Email.subject, sanitized, cut to 200 characters
}

export interface SpamFolderImpact {
  count: number // every match among the emails checked
  emails: SpamImpactEmail[] // the newest SPAM_IMPACT_EMAILS_SHOWN (5) matches
}

export interface SpamPhraseImpact {
  inbox: SpamFolderImpact
  phrase: string // echoed exactly as sent
  spam: SpamFolderImpact
}

export interface SpamCheckedCount {
  checked: number // emails read successfully in time
  total: number // emails in the folder, not counting excludeEmailId
}

export interface SpamImpactResponse {
  checked: { inbox: SpamCheckedCount; spam: SpamCheckedCount }
  // true when a read failed or the deadline cut reads short, so inbox.checked < the smaller of inbox.total and 100
  inboxIncomplete: boolean
  phrases: SpamPhraseImpact[] // one per request phrase, same order
}

// Injected into createPostSpamImpactHandler. createAbortSignal makes the signal that limits the email list's pages
// and each email read, given the milliseconds allowed.
export interface SpamImpactDependencies {
  clock: () => number
  createAbortSignal: (ms: number) => AbortSignal
}

// Push

// The push carries facts, not sentences: the service worker assembles the English. These three
// fields are the only ones ever sent to a browser.
export interface PushPayload {
  emailId: string
  senderLabel?: string
  subject?: string
}

// Bounces

export interface BounceOutbound {
  messageId: string
  recipients: string[]
  bounceSender: string
  bounceType?: BounceType
}

export type BounceType =
  'ContentRejected' | 'DoesNotExist' | 'ExceededQuota' | 'MessageTooLarge' | 'TemporaryFailure' | 'Undefined'

// Queue API

export interface QueueResponse {
  messageId: string
}

// Signed URLs

export interface PostSignedUrl {
  fields: StringObject
  url: string
}
