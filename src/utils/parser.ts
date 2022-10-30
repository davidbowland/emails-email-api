import { EmailAddress, EmailAddressReplyTo, EmailContents, EmailHeaders, ParsedMail } from '../types'

const emptyAddress: EmailAddress = {
  html: '',
  text: '',
  value: [
    {
      address: '',
      name: '',
    },
  ],
}

const emptyAddressReplyTo: EmailAddressReplyTo = {
  display: '',
  value: [
    {
      address: '',
      name: '',
    },
  ],
}

export const convertParsedContentsToEmail = (emailId: string, parsedMail: ParsedMail): EmailContents => ({
  attachments: parsedMail.attachments?.map((attachment) => ({
    filename: attachment.filename ?? 'unknown',
    id: attachment.cid ?? attachment.checksum,
    size: parseInt(`${attachment.size}`.replace(/\D+/g, ''), 10),
    type: attachment.type,
  })),
  bodyHtml: (parsedMail.html ?? parsedMail.textAsHtml) || '',
  bodyText: parsedMail.text ?? '',
  ccAddress: parsedMail.cc as unknown as EmailAddress,
  fromAddress: (parsedMail.from ?? emptyAddress) as EmailAddress,
  headers: parsedMail.headers as unknown as EmailHeaders,
  id: parsedMail.messageId ?? emailId,
  inReplyTo: parsedMail.inReplyTo,
  references: typeof parsedMail.references === 'string' ? [parsedMail.references] : parsedMail.references ?? [],
  replyToAddress: (parsedMail.replyTo ?? emptyAddressReplyTo) as EmailAddressReplyTo,
  subject: parsedMail.subject,
  toAddress: parsedMail.to as unknown as EmailAddress,
})
