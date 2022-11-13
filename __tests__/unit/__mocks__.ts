import { Account, AccountBatch, Email, EmailAttachment, EmailBatch, ParsedMail, PatchOperation } from '@types'

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

export const attachment: EmailAttachment = {
  filename: 'fnord.jpg',
  id: attachmentId,
  size: 1976642,
  type: 'image/jpeg',
}

export const emailId = '7yh8g-7ytguy-98ui8u-5efka-87y87y'

export const email: Email = {
  attachments: [attachment],
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
  attachments: [
    {
      checksum: '335a8335831f08e391d3a1d38a3167c9',
      cid: 'f_kx2qxtrl0',
      content: { data: [130], type: 'Buffer' },
      contentDisposition: 'attachment',
      contentId: '<f_kx2qxtrl0>',
      contentType: 'image/png',
      filename: 'alexa-screenshot.png',
      headers: {},
      partId: '2',
      release: null,
      size: 25277,
      type: 'attachment',
    },
    {
      checksum: 'i87trdcvbnmnbfdfyujigf',
      content: { data: [130], type: 'Buffer' },
      contentDisposition: 'attachment',
      contentId: '<f_kx2qxtrl0>',
      contentType: 'image/png',
      headers: {},
      partId: '2',
      release: null,
      size: 45678,
      type: 'attachment',
    },
  ],
  date: '2018-08-06T00:58:58.000Z',
  from: {
    html: '<span class="mp_address_group"><span class="mp_address_name">Another Person</span> &lt;<a href="mailto:another@domain.com" class="mp_address_email">another@domain.com</a>&gt;</span>',
    text: 'Another Person <another@domain.com>',
    value: [
      {
        address: 'another@domain.com',
        name: 'Another Person',
      },
    ],
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
    html: '<span class="mp_address_group"><a href="mailto:account@domain.com" class="mp_address_email">account@domain.com</a></span>',
    text: 'account@domain.com',
    value: [
      {
        address: 'account@domain.com',
        name: '',
      },
    ],
  },
} as unknown as ParsedMail
