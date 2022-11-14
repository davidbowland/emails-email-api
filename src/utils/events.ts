import jwt from 'jsonwebtoken'

import {
  APIGatewayProxyEventV2,
  Account,
  Email,
  EmailAddress,
  EmailContents,
  EmailHeaders,
  EmailOutbound,
  PatchOperation,
  StringObject,
} from '../types'

/* Account */

export const formatAccount = (account: Account): Account => {
  if (!Array.isArray(account.forwardTargets)) {
    throw new Error('forwardTargets must be an array of email addresses')
  }
  if (!account.name) {
    throw new Error('name must be defined must be an array of email addresses')
  }

  return {
    forwardTargets: account.forwardTargets,
    name: account.name,
  }
}

/* Email */

export const convertOutboundToContents = (messageId: string, outbound: EmailOutbound): EmailContents => ({
  bodyHtml: outbound.html,
  bodyText: outbound.text,
  ccAddress: outbound.cc && {
    html: '',
    text: '',
    value: outbound.cc,
  },
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
  // attachments: outbound.attachments?.map((attachment) => ({
  //   filename: attachment.filename || 'unknown',
  //   id: attachment.cid || attachment.checksum,
  //   size: parseInt(`${attachment.size}`.replace(/\D+/g, ''), 10),
  //   type: attachment.type,
  // })),
  bcc: outbound.bcc?.map((address) => address.address),
  cc: outbound.cc?.map((address) => address.address),
  from: outbound.from.address,
  subject: outbound.subject,
  timestamp: new Date().getTime(),
  to: outbound.to?.map((address) => address.address) ?? [],
  viewed: false,
})

export const formatEmail = (email: Email): Email => {
  if (!Array.isArray(email.to)) {
    throw new Error('to must be an array of email addresses')
  }
  if (email.cc && !Array.isArray(email.cc)) {
    throw new Error('cc must be an array of email addresses, when present')
  }
  if (email.bcc && !Array.isArray(email.bcc)) {
    throw new Error('cc must be an array of email addresses, when present')
  }
  if (!email.from) {
    throw new Error('from must be specified')
  }
  if (email.subject === undefined) {
    throw new Error('subject must be specified')
  }
  if (email.attachments) {
    if (!Array.isArray(email.attachments)) {
      throw new Error('attachments must be an array of attachments, when present')
    }
    for (const attachment of email.attachments) {
      if (!attachment.filename) {
        throw new Error('filename is required for all attachments')
      }
      if (!attachment.id) {
        throw new Error('id is required for all attachments')
      }
      if (!attachment.size || isNaN(parseInt(`${attachment.size}`.replace(/\D+/g, ''), 10))) {
        throw new Error('size miust be an integer for all attachments')
      }
      if (!attachment.type) {
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
    from: email.from,
    subject: email.subject,
    timestamp: email.timestamp ?? new Date().getTime(),
    to: email.to,
    viewed: false,
  }
}

export const formatEmailOutbound = (email: EmailOutbound, from: EmailAddress): EmailOutbound => {
  if (!Array.isArray(email.to)) {
    throw new Error('to must be an array of email addresses')
  }
  if (email.cc && !Array.isArray(email.cc)) {
    throw new Error('cc must be an array of email addresses, when present')
  }
  if (email.bcc && !Array.isArray(email.bcc)) {
    throw new Error('bcc must be an array of email addresses, when present')
  }
  if (email.html === undefined) {
    throw new Error('html must be specified')
  }
  if (email.references && !Array.isArray(email.references)) {
    throw new Error('references must be an array of message IDs, when present')
  }
  if (email.subject === undefined) {
    throw new Error('subject must be specified')
  }
  if (email.text === undefined) {
    throw new Error('text must be specified')
  }
  // if (email.attachments) {
  //   if (!Array.isArray(email.attachments)) {
  //     throw new Error('attachments must be an array of attachments, when present')
  //   }
  //   for (const attachment of email.attachments) {
  //     if (!attachment.checksum) {
  //       throw new Error('checksum is required for all attachments')
  //     }
  //     if (!attachment.content) {
  //       throw new Error('content is required for all attachments')
  //     }
  //     if (!attachment.contentDisposition) {
  //       throw new Error('contentDisposition is required for all attachments')
  //     }
  //     if (!attachment.contentType) {
  //       throw new Error('contentType is required for all attachments')
  //     }
  //     if (!attachment.headerLines) {
  //       throw new Error('headerLines is required for all attachments')
  //     }
  //     if (!attachment.headers) {
  //       throw new Error('headers is required for all attachments')
  //     }
  //     if (!attachment.size || isNaN(parseInt(`${attachment.size}`.replace(/\D+/g, ''), 10))) {
  //       throw new Error('size miust be an integer for all attachments')
  //     }
  //   }
  // }

  return {
    // attachments: email.attachments?.map((attachment) => ({
    //   checksum: attachment.checksum,
    //   cid: attachment.cid,
    //   content: attachment.content,
    //   contentDisposition: attachment.contentDisposition,
    //   contentId: attachment.contentId,
    //   contentType: attachment.contentType,
    //   filename: attachment.filename,
    //   headerLines: attachment.headerLines,
    //   headers: attachment.headers,
    //   related: attachment.related,
    //   size: attachment.size,
    //   type: 'attachment',
    // })),
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
    event.isBase64Encoded && event.body ? Buffer.from(event.body, 'base64').toString('utf8') : (event.body as string)
  )

export const extractAccountFromEvent = (event: APIGatewayProxyEventV2): Account =>
  formatAccount(parseEventBody(event) as Account)

export const extractEmailFromEvent = (event: APIGatewayProxyEventV2): Email =>
  formatEmail(parseEventBody(event) as Email)

export const extractEmailOutboundFromEvent = (event: APIGatewayProxyEventV2, from: EmailAddress): EmailOutbound =>
  formatEmailOutbound(parseEventBody(event) as EmailOutbound, from)

export const extractJsonPatchFromEvent = (event: APIGatewayProxyEventV2): PatchOperation[] =>
  parseEventBody(event) as PatchOperation[]

export const extractJwtFromEvent = (event: APIGatewayProxyEventV2): StringObject =>
  jwt.decode(
    (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer /i, '')
  ) as StringObject

export const extractUsernameFromEvent = (event: APIGatewayProxyEventV2): string =>
  event.requestContext?.domainPrefix === 'emails-email-api-internal'
    ? (event.headers['x-user-name'] as string)
    : extractJwtFromEvent(event)['cognito:username']
