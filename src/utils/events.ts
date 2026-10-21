import jwt from 'jsonwebtoken'

import { DEFAULT_SPAM_FILTER } from '../config'
import {
  Account,
  APIGatewayProxyEventV2,
  AttachmentCommon,
  Email,
  EmailAddress,
  EmailAttachment,
  EmailContents,
  EmailFolder,
  EmailHeaders,
  EmailOutbound,
  NOTIFICATION_PREVIEWS,
  PatchOperation,
  PushSubscription,
  SpamFilter,
  SpamSensitivity,
  StringObject,
} from '../types'

/* Spam filter */

const SPAM_SENSITIVITIES: SpamSensitivity[] = ['low', 'medium', 'high']
const SPAM_FILTER_MAX_ENTRIES = 100
const SPAM_FILTER_MAX_ENTRY_LENGTH = 100

// A phrase with no letter or digit normalizes to zero words and would match nothing (or, in a
// careless matcher, everything).
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u
// An address (local@domain.tld), an @domain or a bare domain; each domain needs at least one dot so
// a bare TLD such as "com" cannot trust half the internet. No whitespace and no wildcards.
// Separators, quotes, brackets and invisible format characters (zero-width spaces among them) are
// rejected too: an entry carrying them could be stored but never match a sender.
const TRUSTED_SENDER_PATTERN = /^(?:[^\s@*<>,;"'()\p{Cf}]+@|@)?[^\s@*.<>,;"'()\p{Cf}]+(?:\.[^\s@*.<>,;"'()\p{Cf}]+)+$/u

// No message here quotes an entry: handlers echo these messages back and logs may carry them.
const validateSpamFilterList = (
  list: unknown,
  name: string,
  isValidEntry: (entry: string) => boolean,
  entryRule: string,
): string[] => {
  if (!Array.isArray(list)) {
    throw new Error(`spamFilter.${name} must be an array of strings`)
  }
  if (list.length > SPAM_FILTER_MAX_ENTRIES) {
    throw new Error(`spamFilter.${name} must have ${SPAM_FILTER_MAX_ENTRIES} entries or fewer`)
  }
  if (!list.every((entry) => typeof entry === 'string')) {
    throw new Error(`spamFilter.${name} must be an array of strings`)
  }
  if (!list.every((entry) => entry.length <= SPAM_FILTER_MAX_ENTRY_LENGTH)) {
    throw new Error(`spamFilter.${name} entries must be ${SPAM_FILTER_MAX_ENTRY_LENGTH} characters or fewer`)
  }
  if (!list.every(isValidEntry)) {
    throw new Error(`spamFilter.${name} entries must ${entryRule}`)
  }
  return [...list]
}

export const formatSpamFilter = (spamFilter: SpamFilter): SpamFilter => {
  if (typeof spamFilter !== 'object' || spamFilter === null || Array.isArray(spamFilter)) {
    throw new Error('spamFilter must be an object')
  }
  if (!SPAM_SENSITIVITIES.includes(spamFilter.sensitivity)) {
    throw new Error(`spamFilter.sensitivity must be one of ${SPAM_SENSITIVITIES.join(', ')}`)
  }

  return {
    blockPhrases: validateSpamFilterList(
      spamFilter.blockPhrases,
      'blockPhrases',
      // Checked after NFKC, the same normalization the phrase matcher applies first.
      (phrase) => HAS_LETTER_OR_DIGIT.test(phrase.normalize('NFKC')),
      'contain at least one letter or number',
    ),
    sensitivity: spamFilter.sensitivity,
    trustedSenders: validateSpamFilterList(
      spamFilter.trustedSenders,
      'trustedSenders',
      (sender) => TRUSTED_SENDER_PATTERN.test(sender),
      'be an email address, an @domain or a domain',
    ),
  }
}

/* Account */

// storedSpamFilter is what an account write keeps when the request carries no spamFilter at all, so
// a client that predates the field cannot wipe the owner's rules. On PATCH the stored account is the
// patch target, so its spamFilter is always present and is validated as part of the post-patch
// account. On PUT, put-account.ts reads the stored item and passes its spamFilter through
// extractAccountFromEvent; the default applies only when nothing is stored.
export const formatAccount = (account: Account, storedSpamFilter: SpamFilter = DEFAULT_SPAM_FILTER): Account => {
  if (!Array.isArray(account.bounceSenders)) {
    throw new Error('bounceSenders must be an array of email addresses or domains')
  }
  if (!Array.isArray(account.forwardTargets)) {
    throw new Error('forwardTargets must be an array of email addresses')
  }
  if (!account.name) {
    throw new Error('name must be defined')
  }

  return {
    bounceSenders: account.bounceSenders,
    forwardTargets: account.forwardTargets,
    name: account.name,
    // formatAccount rebuilds the account from a fixed field list and runs on both the PUT and the
    // PATCH path, so anything missing here is silently dropped on every account write. An unknown or
    // absent value resolves to a tier instead of throwing, so a client that predates the field can
    // still save.
    //
    // This fallback is deliberately NOT DEFAULT_NOTIFICATION_PREVIEW, which normalizeLegacyAccount
    // (services/dynamodb.ts) applies on the READ path. The asymmetry is the point. Absent on read
    // means "this account never chose", and the most informative tier is the right welcome. Absent
    // on WRITE means "this client cannot express the choice" -- setAccountById is a PutItemCommand
    // and put-account.ts never reads the stored item first, so a PUT from a device running a stale
    // precached emails-ui bundle would overwrite a deliberate 'none' with 'sender-and-subject' and
    // start putting mail on that person's lock screen without a word. The quietest tier is the only
    // safe answer to a request that says nothing.
    notificationPreview: NOTIFICATION_PREVIEWS.includes(account.notificationPreview)
      ? account.notificationPreview
      : 'none',
    spamFilter: formatSpamFilter(account.spamFilter === undefined ? storedSpamFilter : account.spamFilter),
  }
}

/* Push subscriptions */

const PUSH_ENDPOINT_MAX_LENGTH = 2048

// A subscription missing either key cannot be encrypted to, and would throw inside every future
// sendNotification -- a per-send exception, never the 410 that pruning acts on, so it would linger
// forever. Reject it at the boundary instead. No message here may quote the endpoint: it is
// per-device data and handlers echo these messages back.
export const formatPushSubscription = (subscription: PushSubscription): PushSubscription => {
  if (typeof subscription?.endpoint !== 'string' || subscription.endpoint.length === 0) {
    throw new Error('subscription.endpoint must be a non-empty string')
  }
  if (subscription.endpoint.length > PUSH_ENDPOINT_MAX_LENGTH) {
    throw new Error(`subscription.endpoint must be ${PUSH_ENDPOINT_MAX_LENGTH} characters or fewer`)
  }
  if (!subscription.endpoint.startsWith('https://')) {
    throw new Error('subscription.endpoint must be an https URL')
  }
  if (typeof subscription.keys?.p256dh !== 'string' || subscription.keys.p256dh.length === 0) {
    throw new Error('subscription.keys.p256dh must be a non-empty string')
  }
  if (typeof subscription.keys?.auth !== 'string' || subscription.keys.auth.length === 0) {
    throw new Error('subscription.keys.auth must be a non-empty string')
  }

  return {
    endpoint: subscription.endpoint,
    keys: {
      auth: subscription.keys.auth,
      p256dh: subscription.keys.p256dh,
    },
  }
}

/* Email */

const convertOutboundAttachmentToEmail = (attachment: AttachmentCommon): EmailAttachment => ({
  filename: attachment.filename || 'unknown',
  id: attachment.cid || attachment.checksum,
  size: parseInt(`${attachment.size}`.replace(/\D+/g, ''), 10),
  type: attachment.contentType,
})

export const convertOutboundToContents = (
  messageId: string,
  outbound: EmailOutbound,
  timestamp: number,
): EmailContents => ({
  attachments: outbound.attachments?.map(convertOutboundAttachmentToEmail),
  bccAddress: outbound.bcc && {
    html: '',
    text: '',
    value: outbound.bcc,
  },
  bodyHtml: outbound.html,
  bodyText: outbound.text,
  ccAddress: outbound.cc && {
    html: '',
    text: '',
    value: outbound.cc,
  },
  date: new Date(timestamp).toISOString(),
  fromAddress: {
    html: '',
    text: '',
    value: [outbound.from],
  },
  headers: outbound.headers as unknown as EmailHeaders,
  id: messageId,
  inReplyTo: outbound.inReplyTo,
  references: outbound.references ?? [],
  replyToAddress: {
    display: '',
    value: [outbound.replyTo],
  },
  subject: outbound.subject,
  toAddress: {
    html: '',
    text: '',
    value: outbound.to ?? [],
  },
})

export const convertOutboundToEmail = (outbound: EmailOutbound): Email => ({
  attachments: outbound.attachments?.map(convertOutboundAttachmentToEmail),
  bcc: outbound.bcc?.map((address) => address.address),
  cc: outbound.cc?.map((address) => address.address),
  from: outbound.from.address,
  subject: outbound.subject,
  timestamp: new Date().getTime(),
  to: outbound.to?.map((address) => address.address) ?? [],
  viewed: false,
})

const EMAIL_FOLDERS: EmailFolder[] = ['inbox', 'spam']

export const formatEmail = (email: Email): Email => {
  if (email.folder !== undefined && !EMAIL_FOLDERS.includes(email.folder)) {
    throw new Error(`folder must be one of ${EMAIL_FOLDERS.join(', ')}, when present`)
  } else if (email.to && !Array.isArray(email.to)) {
    throw new Error('to must be an array of email addresses, when present')
  } else if (email.cc && !Array.isArray(email.cc)) {
    throw new Error('cc must be an array of email addresses, when present')
  } else if (email.bcc && !Array.isArray(email.bcc)) {
    throw new Error('bcc must be an array of email addresses, when present')
  } else if ((email.to?.length ?? 0) + (email.cc?.length ?? 0) + (email.bcc?.length ?? 0) === 0) {
    throw new Error('One of to, cc, or bcc must be an array of addresses')
  } else if (!email.from) {
    throw new Error('from must be specified')
  } else if (email.subject === undefined) {
    throw new Error('subject must be specified')
  }
  if (email.attachments) {
    if (!Array.isArray(email.attachments)) {
      throw new Error('attachments must be an array of attachments, when present')
    }
    for (const attachment of email.attachments) {
      if (!attachment.filename) {
        throw new Error('filename is required for all attachments')
      } else if (!attachment.id) {
        throw new Error('id is required for all attachments')
      } else if (!attachment.size || isNaN(parseInt(`${attachment.size}`.replace(/\D+/g, ''), 10))) {
        throw new Error('size miust be an integer for all attachments')
      } else if (!attachment.type) {
        throw new Error('type is required for all attachments')
      }
    }
  }

  return {
    attachments: email.attachments?.map((attachment) => ({
      filename: attachment.filename,
      id: attachment.id,
      size: parseInt(`${attachment.size}`.replace(/\D+/g, ''), 10),
      type: attachment.type,
    })),
    bcc: email.bcc,
    cc: email.cc,
    folder: email.folder,
    from: email.from,
    subject: email.subject,
    timestamp: email.timestamp ?? new Date().getTime(),
    to: email.to,
    viewed: false,
  }
}

export const formatEmailOutbound = (email: EmailOutbound, from: EmailAddress): EmailOutbound => {
  if (email.to && !Array.isArray(email.to)) {
    throw new Error('to must be an array of email addresses, when present')
  } else if (email.cc && !Array.isArray(email.cc)) {
    throw new Error('cc must be an array of email addresses, when present')
  } else if (email.bcc && !Array.isArray(email.bcc)) {
    throw new Error('bcc must be an array of email addresses, when present')
  } else if ((email.to?.length ?? 0) + (email.cc?.length ?? 0) + (email.bcc?.length ?? 0) === 0) {
    throw new Error('One of to, cc, or bcc must be an array of addresses')
  } else if (email.html === undefined) {
    throw new Error('html must be specified')
  } else if (email.references && !Array.isArray(email.references)) {
    throw new Error('references must be an array of message IDs, when present')
  } else if (email.subject === undefined) {
    throw new Error('subject must be specified')
  } else if (email.text === undefined) {
    throw new Error('text must be specified')
  }
  if (email.attachments) {
    if (!Array.isArray(email.attachments)) {
      throw new Error('attachments must be an array of attachments, when present')
    }
    for (const attachment of email.attachments) {
      if (!attachment.content) {
        throw new Error('content is required for all attachments')
      }
      if (!attachment.contentDisposition) {
        throw new Error('contentDisposition is required for all attachments')
      }
      if (!attachment.contentType) {
        throw new Error('contentType is required for all attachments')
      }
      if (!attachment.headerLines) {
        throw new Error('headerLines is required for all attachments')
      }
      if (!attachment.headers) {
        throw new Error('headers is required for all attachments')
      }
      if (!attachment.size || isNaN(parseInt(`${attachment.size}`.replace(/\D+/g, ''), 10))) {
        throw new Error('size must be an integer for all attachments')
      }
    }
  }

  return {
    attachments: email.attachments?.map((attachment) => ({
      checksum: attachment.checksum,
      cid: attachment.cid,
      content: attachment.content,
      contentDisposition: attachment.contentDisposition,
      contentId: attachment.contentId,
      contentType: attachment.contentType,
      filename: attachment.filename,
      headerLines: attachment.headerLines,
      headers: attachment.headers,
      related: attachment.related,
      size: attachment.size,
      type: 'attachment',
    })),
    bcc: email.bcc,
    cc: email.cc,
    from: from,
    headers: email.headers,
    html: email.html,
    inReplyTo: email.inReplyTo,
    references: email.references,
    replyTo: from,
    sender: from,
    subject: email.subject,
    text: email.text,
    to: email.to,
  }
}

/* Event */

const parseEventBody = (event: APIGatewayProxyEventV2): unknown =>
  JSON.parse(
    event.isBase64Encoded && event.body ? Buffer.from(event.body, 'base64').toString('utf8') : (event.body as string),
  )

export const extractAccountFromEvent = (
  event: APIGatewayProxyEventV2,
  storedSpamFilter: SpamFilter = DEFAULT_SPAM_FILTER,
): Account => formatAccount(parseEventBody(event) as Account, storedSpamFilter)

export const extractEmailFromEvent = (event: APIGatewayProxyEventV2): Email =>
  formatEmail(parseEventBody(event) as Email)

export const extractEmailOutboundFromEvent = (event: APIGatewayProxyEventV2, from: EmailAddress): EmailOutbound =>
  formatEmailOutbound(parseEventBody(event) as EmailOutbound, from)

export const extractJsonPatchFromEvent = (event: APIGatewayProxyEventV2): PatchOperation[] =>
  parseEventBody(event) as PatchOperation[]

export const extractPushSubscriptionFromEvent = (event: APIGatewayProxyEventV2): PushSubscription =>
  formatPushSubscription((parseEventBody(event) as { subscription: PushSubscription })?.subscription)

// jwt.decode returns null for anything it cannot parse -- a truncated, corrupt or absent bearer
// value -- and the declared StringObject return type hid that from every caller. Resolving it to an
// empty object keeps the type honest and makes validateUsernameInEvent below answer "not this
// account" instead of throwing a TypeError, which handlers were turning into a 400 or a 500
// depending on where the throw landed. An unreadable token is a denied caller: 403.
export const extractJwtFromEvent = (event: APIGatewayProxyEventV2): StringObject =>
  (jwt.decode((event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer /i, '')) ??
    {}) as StringObject

export const validateUsernameInEvent = (event: APIGatewayProxyEventV2, username: string): boolean => {
  if (
    event.requestContext?.domainPrefix === 'emails-email-api-internal' ||
    event.requestContext?.domainPrefix === 'localhost'
  ) {
    return true
  }
  return extractJwtFromEvent(event)['cognito:username'] === username
}
