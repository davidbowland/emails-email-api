export * from 'aws-lambda'
export { AxiosResponse } from 'axios'
export { ParsedMail } from 'mailparser'
export { Operation as PatchOperation } from 'fast-json-patch'

import { Metadata } from 'aws-sdk/clients/s3'

export interface StringObject {
  [key: string]: string
}

export interface AttachmentCommon {
  checksum: string
  cid?: string
  content: any
  contentDisposition: string
  contentId?: string
  contentType: string
  filename?: string
  headerLines: any
  headers: StringObject
  related?: boolean
  size: number
  type: 'attachment'
}

export interface AttachmentContents {
  body: Buffer | string
  metadata: Metadata
}

export interface Account {
  forwardTargets: string[]
  name: string
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

export interface EmailResponse {
  messageId: string
}
