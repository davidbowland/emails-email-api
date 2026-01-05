import {
  Account,
  AccountBatch,
  Email,
  EmailAttachment,
  EmailBatch,
  EmailContents,
  EmailOutbound,
  ParsedMail,
  PatchOperation,
  PostSignedUrl,
} from '@types'

export const accountId = 'account'

export const account: Account = {
  bounceSenders: [],
  forwardTargets: ['any@domain.com'],
  name: 'Any',
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
  bcc: ['bcc@domain.com'],
  cc: ['cc@domain.com'],
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

export const emailContents: EmailContents = {
  attachments: [
    {
      filename: 'alexa-screenshot.png',
      id: 'f_kx2qxtrl0',
      size: 25277,
      type: 'image/png',
    },
    {
      filename: 'unknown',
      id: 'i87trdcvbnmnbfdfyujigf',
      size: 45678,
      type: 'image/png',
    },
  ],
  bccAddress: {
    html: '',
    text: '',
    value: [
      {
        address: 'bcc@domain.com',
        name: 'BCC',
      },
    ],
  },
  bodyHtml: '<p>Lorem ipsum</p>',
  bodyText: 'Lorem ipsum',
  ccAddress: {
    html: '',
    text: '',
    value: [
      {
        address: 'cc@domain.com',
        name: 'CC',
      },
    ],
  },
  date: '2018-08-06T00:58:58.000Z',
  fromAddress: {
    html: '',
    text: '',
    value: [
      {
        address: 'account@domain.com',
        name: 'Any',
      },
    ],
  },
  headers: undefined,
  id: '7yh8g-7ytguy-98ui8u-5efka-87y87y',
  inReplyTo: '765rf-76trf-90oij-edfvb-nbfa2',
  references: ['765rf-76trf-90oij-edfvb-nbfa2', '5tyha-0oigk-mnfdb-dfgsh-jhgfa'],
  replyToAddress: {
    display: '',
    value: [
      {
        address: 'account@domain.com',
        name: 'Any',
      },
    ],
  },
  subject: 'Hello, world!',
  toAddress: {
    html: '',
    text: '',
    value: [
      {
        address: 'another@domain.com',
        name: 'Someone else',
      },
    ],
  },
}

export const jsonPatchOperations: PatchOperation[] = [
  { op: 'add', path: '/forwardTargets/1', value: 'another@domain.com' },
]

export const outboundEmail: EmailOutbound = {
  attachments: [
    {
      checksum: '335a8335831f08e391d3a1d38a3167c9',
      cid: 'f_kx2qxtrl0',
      content: { data: [130], type: 'Buffer' },
      contentDisposition: 'attachment',
      contentId: '<f_kx2qxtrl0>',
      contentType: 'image/png',
      filename: 'alexa-screenshot.png',
      headerLines: {},
      headers: {},
      size: 25277,
      type: 'attachment',
    },
    {
      checksum: 'i87trdcvbnmnbfdfyujigf',
      content: { data: [130], type: 'Buffer' },
      contentDisposition: 'attachment',
      contentId: '<f_kx2qxtrl0>',
      contentType: 'image/png',
      headerLines: {},
      headers: {},
      size: 45678,
      type: 'attachment',
    },
  ],
  bcc: [{ address: 'bcc@domain.com', name: 'BCC' }],
  cc: [{ address: 'cc@domain.com', name: 'CC' }],
  from: { address: 'account@domain.com', name: 'Any' },
  html: '<p>Lorem ipsum</p>',
  inReplyTo: '765rf-76trf-90oij-edfvb-nbfa2',
  references: ['765rf-76trf-90oij-edfvb-nbfa2', '5tyha-0oigk-mnfdb-dfgsh-jhgfa'],
  replyTo: { address: 'account@domain.com', name: 'Any' },
  sender: { address: 'account@domain.com', name: 'Any' },
  subject: 'Hello, world!',
  text: 'Lorem ipsum',
  to: [{ address: 'another@domain.com', name: 'Someone else' }],
}

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
  cc: ['cc@domain.com'],
  date: new Date('2018-08-06T00:58:58.000Z'),
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

export const postAttachmentResult: PostSignedUrl = {
  fields: {
    bucket: 'emails-service-storage-test',
    key: 'attachments/account/uuuuu-uuuuu-iiiii-ddddd',
    Policy: 'eyJleHBpcmF0aW9uIjoiMjAyMi0xMS',
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': 'ASIAXGOMQQ35UBADF3FP/20221117/us-east-1/s3/aws4_request',
    'X-Amz-Date': '20221117T061759Z',
    'X-Amz-Security-Token': 'IQoJb3JpZ2luX2VjEB4aCXVzLWVhc3QtMiJIMEYCIQCLh3B9MRsCAXTnu0',
    'X-Amz-Signature': 'f6e87c8b350576d9a3ca56b70660',
  },
  url: 'https://s3.amazonaws.com/emails-service-storage-test',
}
