export * from 'aws-lambda'
export { ParsedMail } from 'mailparser'
export { Operation as PatchOperation } from 'fast-json-patch'

import { Metadata } from 'aws-sdk/clients/s3'

export interface AttachmentContents {
  body: Buffer | string
  metadata: Metadata
}

export interface Account {
  forwardTargets: string[]
}

export interface AccountBatch {
  data: Account
  id: string
}

export interface EmailAttachment {
  filename: string
  id: string
  size: number
  type: string
}

export interface Email {
  attachments?: EmailAttachment[]
  bcc?: string[]
  cc?: string[]
  from: string
  subject: string
  timestamp: number
  to: string[]
  viewed: boolean
}

export interface EmailAddress {
  html: string
  text: string
  value: {
    address: string
    name: string
  }[]
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
  bodyHtml: string
  bodyText: string
  ccAddress?: EmailAddress
  fromAddress: EmailAddress
  headers: EmailHeaders
  id: string
  inReplyTo?: string
  references: string[]
  replyToAddress: EmailAddressReplyTo
  subject?: string
  toAddress?: EmailAddress
}

export interface StringObject {
  [key: string]: string
}
