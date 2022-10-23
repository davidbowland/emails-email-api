import { APIGatewayProxyEventV2, Account, Email, EmailAttachment } from '@types'
import { account, attachmentId, email, jsonPatchOperations } from '../__mocks__'
import {
  extractAccountFromEvent,
  extractEmailFromEvent,
  extractJsonPatchFromEvent,
  extractJwtFromEvent,
  extractUsernameFromEvent,
  formatAccount,
  formatEmail,
} from '@utils/events'
import getEventJson from '@events/received/get-email.json'
import patchEventJson from '@events/patch-account.json'
import putAccountEventJson from '@events/put-account.json'
import putEmailEventJson from '@events/received/put-email.json'

describe('events', () => {
  describe('formatAccount', () => {
    test('expect formatted account', () => {
      const accountWithExtra = { ...account, something: 'invalid' } as unknown as Account
      const formattedAccount = formatAccount(accountWithExtra)
      expect(formattedAccount).toEqual({ forwardTargets: ['any@domain.com'] })
    })

    test.each([undefined, 'a string'])('expect error on invalid to - %s', (forwardTargets) => {
      const invalidAccount = { ...account, forwardTargets } as unknown as Account
      expect(() => formatAccount(invalidAccount)).toThrow()
    })
  })

  describe('formatEmail', () => {
    const attachment: EmailAttachment = {
      filename: 'whatever.pdf',
      id: attachmentId,
      size: 10_000,
      type: 'application/pdf',
    }

    test('expect formatted email', () => {
      const emailWithAttachments = { ...email, attachments: [attachment], something: 'invalid' } as unknown as Email
      const formattedEmail = formatEmail(emailWithAttachments)
      expect(formattedEmail).toEqual({
        attachments: [
          { filename: 'whatever.pdf', id: '9ijh-6tfg-dfsf3-sdfio-johac', size: 10000, type: 'application/pdf' },
        ],
        bcc: undefined,
        cc: undefined,
        from: 'another@domain.com',
        subject: 'Hello, world',
        timestamp: 1666560735998,
        to: ['account@domain.com'],
        viewed: false,
      })
    })

    test.each([undefined, 'a string'])('expect error on invalid to - %s', (to) => {
      const invalidEmail = { ...email, to } as unknown as Email
      expect(() => formatEmail(invalidEmail)).toThrow()
    })

    test('expect error on invalid cc', () => {
      const invalidEmail = { ...email, cc: 'a string' } as unknown as Email
      expect(() => formatEmail(invalidEmail)).toThrow()
    })

    test('expect error on invalid bcc', () => {
      const invalidEmail = { ...email, bcc: 'a string' } as unknown as Email
      expect(() => formatEmail(invalidEmail)).toThrow()
    })

    test('expect error on invalid from', () => {
      const invalidEmail = { ...email, from: undefined } as unknown as Email
      expect(() => formatEmail(invalidEmail)).toThrow()
    })

    test('expect error on invalid subject', () => {
      const invalidEmail = { ...email, subject: undefined } as unknown as Email
      expect(() => formatEmail(invalidEmail)).toThrow()
    })

    test.each([
      'a string',
      [{ ...attachment, filename: undefined }],
      [{ ...attachment, id: undefined }],
      [{ ...attachment, size: undefined }],
      [{ ...attachment, size: 'fnord' }],
      [{ ...attachment, type: undefined }],
    ])('expect error on invalid attachments - %o', (attachments) => {
      const invalidEmail = { ...email, attachments } as unknown as Email
      expect(() => formatEmail(invalidEmail)).toThrow()
    })

    test('expect timestamp when none provided', () => {
      const emailWithoutTimestamp = { ...email, timestamp: undefined } as unknown as Email
      const formattedEmail = formatEmail(emailWithoutTimestamp)
      expect(formattedEmail.timestamp).toBeDefined()
    })
  })

  describe('extractAccountFromEvent', () => {
    const event = putAccountEventJson as unknown as APIGatewayProxyEventV2

    test('expect account from event', () => {
      const result = extractAccountFromEvent(event)
      expect(result).toEqual(account)
    })

    test('expect account from event in base64', () => {
      const tempEvent = {
        ...event,
        body: Buffer.from(event.body).toString('base64'),
        isBase64Encoded: true,
      } as unknown as APIGatewayProxyEventV2
      const result = extractAccountFromEvent(tempEvent)
      expect(result).toEqual(account)
    })

    test('expect reject on invalid event', () => {
      const tempEvent = { ...event, body: JSON.stringify({}) } as unknown as APIGatewayProxyEventV2
      expect(() => extractAccountFromEvent(tempEvent)).toThrow()
    })
  })

  describe('extractEmailFromEvent', () => {
    const event = putEmailEventJson as unknown as APIGatewayProxyEventV2

    test('expect email from event', () => {
      const result = extractEmailFromEvent(event)
      expect(result).toEqual(email)
    })

    test('expect email from event in base64', () => {
      const tempEvent = {
        ...event,
        body: Buffer.from(event.body).toString('base64'),
        isBase64Encoded: true,
      } as unknown as APIGatewayProxyEventV2
      const result = extractEmailFromEvent(tempEvent)
      expect(result).toEqual(email)
    })

    test('expect reject on invalid event', () => {
      const tempEvent = { ...event, body: JSON.stringify({}) } as unknown as APIGatewayProxyEventV2
      expect(() => extractEmailFromEvent(tempEvent)).toThrow()
    })
  })

  describe('extractJsonPatchFromEvent', () => {
    test('expect preference from event', () => {
      const result = extractJsonPatchFromEvent(patchEventJson as unknown as APIGatewayProxyEventV2)
      expect(result).toEqual(jsonPatchOperations)
    })
  })

  describe('extractJwtFromEvent', () => {
    test('expect payload successfully extracted', () => {
      const result = extractJwtFromEvent(getEventJson as unknown as APIGatewayProxyEventV2)
      expect(result).toEqual({
        aud: 'emails.dbowland.com',
        'cognito:username': 'admin',
        exp: 1698212003,
        iat: 1666676003,
        iss: 'https://cognito-idp.us-east-2.amazonaws.com/us-east-2_xqxzyIOz4',
        sub: 'efd31b67-19f2-4d0a-a723-78506ffc0b7e',
      })
    })

    test('expect null on invalid JWT', () => {
      const result = extractJwtFromEvent({
        ...getEventJson,
        headers: {
          authorization: 'Bearer invalid jwt',
        },
      } as unknown as APIGatewayProxyEventV2)
      expect(result).toBe(null)
    })

    test('expect null on missing header', () => {
      const event = { ...getEventJson, headers: {} } as unknown as APIGatewayProxyEventV2
      const result = extractJwtFromEvent(event)
      expect(result).toBe(null)
    })
  })

  describe('extractUsernameFromEvent', () => {
    test('expect user name returned when external', () => {
      const result = extractUsernameFromEvent(getEventJson as unknown as APIGatewayProxyEventV2)
      expect(result).toEqual('admin')
    })

    test('expect user name returned when internal', () => {
      const event = {
        ...getEventJson,
        headers: {
          'x-user-name': 'not-admin',
        },
        requestContext: {
          domainPrefix: 'emails-email-api-internal',
        },
      } as unknown as APIGatewayProxyEventV2
      const result = extractUsernameFromEvent(event)
      expect(result).toEqual('not-admin')
    })
  })
})
