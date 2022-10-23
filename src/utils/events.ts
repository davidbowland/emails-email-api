import jwt from 'jsonwebtoken'

import { APIGatewayProxyEventV2, Account, Email, PatchOperation, StringObject } from '../types'

/* Account */

export const formatAccount = (account: Account): Account => {
  if (!Array.isArray(account.forwardTargets)) {
    throw new Error('forwardTargets must be an array of email addresses')
  }

  return {
    forwardTargets: account.forwardTargets,
  }
}

/* Email */

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

/* Event */

const parseEventBody = (event: APIGatewayProxyEventV2): unknown =>
  JSON.parse(
    event.isBase64Encoded && event.body ? Buffer.from(event.body, 'base64').toString('utf8') : (event.body as string)
  )

export const extractAccountFromEvent = (event: APIGatewayProxyEventV2): Account =>
  formatAccount(parseEventBody(event) as Account)

export const extractEmailFromEvent = (event: APIGatewayProxyEventV2): Email =>
  formatEmail(parseEventBody(event) as Email)

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
