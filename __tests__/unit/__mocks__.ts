import { Account, AccountBatch, Email, EmailBatch, ParsedMail, PatchOperation } from '@types'

export const accountId = 'account'

export const account: Account = {
  forwardTargets: ['any@domain.com'],
}

export const accountBatch: AccountBatch[] = [
  {
    data: account,
    id: accountId,
  },
]

export const attachmentId = '9ijh-6tfg-dfsf3-sdfio-johac'

export const emailId = '7yh8g-7ytguy-98ui8u-5efka-87y87y'

export const email: Email = {
  from: 'another@domain.com',
  subject: 'Hello, world',
  timestamp: 1666560735998,
  to: ['account@domain.com'],
  viewed: false,
}

export const emailBatch: EmailBatch[] = [
  {
    accountId,
    data: email,
    id: emailId,
  },
]

export const jsonPatchOperations: PatchOperation[] = [
  { op: 'replace', path: '/forwardTargets', value: ['another@domain.com'] },
]

export const parsedContents = {
  date: '2018-08-06T00:58:58.000Z',
  from: {
    display: 'Person A <a@person.email>',
    value: [{ address: 'a@person.email', name: 'Person A' }],
  },
  headerLines: [
    { key: 'mime-version', line: 'MIME-Version: 1.0' },
    { key: 'date', line: 'Date: Sun, 5 Aug 2018 19:58:58 -0500' },
    { key: 'message-id', line: `Message-ID: ${emailId}` },
    { key: 'subject', line: 'Subject: P G Wodehouse' },
    { key: 'from', line: 'From: Person A <a@person.email>' },
    { key: 'to', line: 'To: Person B <b@person.email>' },
    {
      key: 'content-type',
      line: 'Content-Type: multipart/alternative; boundary="00000000000054a3f30572b9c865"',
    },
  ],
  headers: {},
  html: '<a href="http://www.gutenberg.org/files/8164/8164-h/8164-h.htm">http://www.gutenberg.org/files/8164/8164-h/8164-h.htm</a>\n',
  messageId: emailId,
  subject: 'P G Wodehouse',
  text: 'http://www.gutenberg.org/files/8164/8164-h/8164-h.htm\n',
  textAsHtml:
    '<p><a href="http://www.gutenberg.org/files/8164/8164-h/8164-h.htm">http://www.gutenberg.org/files/8164/8164-h/8164-h.htm</a></p>',
  to: {
    display: 'Person B <b@person.email>',
    value: [{ address: 'b@person.email', name: 'Person B' }],
  },
} as unknown as ParsedMail
