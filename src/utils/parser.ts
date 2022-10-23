import { EmailAddress, EmailContents, EmailHeaders, ParsedMail } from '../types'

const emptyAddress: EmailAddress = {
  display: '',
  value: [
    {
      address: '',
      name: '',
    },
  ],
}

export const convertParsedContentsToEmail = (emailId: string, parsedMail: ParsedMail): EmailContents => ({
  bodyHtml: (parsedMail.html ?? parsedMail.textAsHtml) || '',
  bodyText: parsedMail.text ?? '',
  ccAddress: parsedMail.cc as unknown as EmailAddress,
  fromAddress: (parsedMail.from ?? emptyAddress) as EmailAddress,
  headers: parsedMail.headers as unknown as EmailHeaders,
  id: parsedMail.messageId ?? emailId,
  inReplyTo: parsedMail.inReplyTo,
  references: typeof parsedMail.references === 'string' ? [parsedMail.references] : parsedMail.references ?? [],
  replyToAddress: (parsedMail.replyTo ?? emptyAddress) as EmailAddress,
  subject: parsedMail.subject,
  toAddress: parsedMail.to as unknown as EmailAddress,
})
