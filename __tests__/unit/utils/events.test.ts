import { APIGatewayProxyEventV2, Account, Email, EmailAttachment, EmailOutbound } from '@types'
import { account, attachmentId, email, emailContents, emailId, jsonPatchOperations, outboundEmail } from '../__mocks__'
import {
  convertOutboundToContents,
  convertOutboundToEmail,
  extractAccountFromEvent,
  extractEmailFromEvent,
  extractEmailOutboundFromEvent,
  extractJsonPatchFromEvent,
  extractJwtFromEvent,
  extractUsernameFromEvent,
  formatAccount,
  formatEmail,
  formatEmailOutbound,
} from '@utils/events'
import getEventJson from '@events/received/get-email.json'
import patchEventJson from '@events/patch-account.json'
import postEventJson from '@events/sent/post-email.json'
import putAccountEventJson from '@events/put-account.json'
import putEmailEventJson from '@events/received/put-email.json'

describe('events', () => {
  const from = {
    address: 'account@domain.com',
    name: 'Any',
  }

  describe('account', () => {
    describe('formatAccount', () => {
      test('expect formatted account', () => {
        const accountWithExtra = { ...account, something: 'invalid' } as unknown as Account
        const formattedAccount = formatAccount(accountWithExtra)
        expect(formattedAccount).toEqual({ forwardTargets: ['any@domain.com'], name: 'Any' })
      })

      test.each([undefined, 'a string'])('expect error on invalid forwardTargets - %s', (forwardTargets) => {
        const invalidAccount = { ...account, forwardTargets } as unknown as Account
        expect(() => formatAccount(invalidAccount)).toThrow()
      })

      test.each([undefined, ''])('expect error on invalid name - %s', (name) => {
        const invalidAccount = { ...account, name } as unknown as Account
        expect(() => formatAccount(invalidAccount)).toThrow()
      })
    })
  })

  describe('email', () => {
    describe('convertOutboundToContents', () => {
      const timestamp = 1533517138000

      test('expect outbound email converted', () => {
        const result = convertOutboundToContents(emailId, outboundEmail, timestamp)
        expect(result).toEqual(emailContents)
      })

      test('expect outbound email converted with empty addresses', () => {
        const outboundWithEmpty = { ...outboundEmail, cc: undefined, references: undefined, to: undefined }
        const result = convertOutboundToContents(emailId, outboundWithEmpty, timestamp)
        expect(result).toEqual(
          expect.objectContaining({
            ccAddress: undefined,
            references: [],
            toAddress: {
              html: '',
              text: '',
              value: [],
            },
          })
        )
      })
    })

    describe('convertOutboundToEmail', () => {
      test('expect outbound email converted', () => {
        const result = convertOutboundToEmail(outboundEmail)
        expect(result).toEqual(
          expect.objectContaining({
            bcc: ['bcc@domain.com'],
            cc: ['cc@domain.com'],
            from: 'account@domain.com',
            subject: 'Hello, world!',
            to: ['another@domain.com'],
            viewed: false,
          })
        )
        expect(result.timestamp).toBeDefined()
      })

      test('expect outbound email converted with empty address', () => {
        const outboundWithEmpty = { ...outboundEmail, bcc: undefined, to: undefined }
        const result = convertOutboundToEmail(outboundWithEmpty)
        expect(result).toEqual(
          expect.objectContaining({
            cc: ['cc@domain.com'],
            from: 'account@domain.com',
            subject: 'Hello, world!',
            to: [],
            viewed: false,
          })
        )
        expect(result.timestamp).toBeDefined()
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
          bcc: ['bcc@domain.com'],
          cc: ['cc@domain.com'],
          from: 'another@domain.com',
          subject: 'Hello, world',
          timestamp: 1666560735998,
          to: ['account@domain.com'],
          viewed: false,
        })
      })

      test('expect error on invalid to', () => {
        const invalidEmail = { ...email, to: 'a string' } as unknown as Email
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

      test('expect error on missing to, cc, and bcc', () => {
        const invalidEmail = { ...email, bcc: undefined, cc: undefined, to: undefined } as unknown as Email
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

    describe('formatEmailOutbound', () => {
      test('expect formatted email', () => {
        const emailWithInvalid = { ...outboundEmail, something: 'invalid' } as unknown as EmailOutbound
        const formattedEmail = formatEmailOutbound(emailWithInvalid, from)
        expect(formattedEmail).toEqual({
          bcc: [
            {
              address: 'bcc@domain.com',
              name: 'BCC',
            },
          ],
          cc: [
            {
              address: 'cc@domain.com',
              name: 'CC',
            },
          ],
          from: {
            address: 'account@domain.com',
            name: 'Any',
          },
          headers: undefined,
          html: '<p>Lorem ipsum</p>',
          inReplyTo: '765rf-76trf-90oij-edfvb-nbfa2',
          references: ['765rf-76trf-90oij-edfvb-nbfa2', '5tyha-0oigk-mnfdb-dfgsh-jhgfa'],
          replyTo: {
            address: 'account@domain.com',
            name: 'Any',
          },
          sender: {
            address: 'account@domain.com',
            name: 'Any',
          },
          subject: 'Hello, world!',
          text: 'Lorem ipsum',
          to: [
            {
              address: 'another@domain.com',
              name: 'Someone else',
            },
          ],
        })
      })

      test('expect error on invalid to', () => {
        const invalidEmail = { ...outboundEmail, to: 'a string' } as unknown as EmailOutbound
        expect(() => formatEmailOutbound(invalidEmail, from)).toThrow()
      })

      test('expect error on invalid cc', () => {
        const invalidEmail = { ...outboundEmail, cc: 'a string' } as unknown as EmailOutbound
        expect(() => formatEmailOutbound(invalidEmail, from)).toThrow()
      })

      test('expect error on invalid bcc', () => {
        const invalidEmail = { ...outboundEmail, bcc: 'a string' } as unknown as EmailOutbound
        expect(() => formatEmailOutbound(invalidEmail, from)).toThrow()
      })

      test('expect error on missing to, cc, and bcc', () => {
        const invalidEmail = {
          ...outboundEmail,
          bcc: undefined,
          cc: undefined,
          to: undefined,
        } as unknown as EmailOutbound
        expect(() => formatEmailOutbound(invalidEmail, from)).toThrow()
      })

      test('expect error on invalid html', () => {
        const invalidEmail = { ...outboundEmail, html: undefined } as unknown as EmailOutbound
        expect(() => formatEmailOutbound(invalidEmail, from)).toThrow()
      })

      test('expect error on invalid references', () => {
        const invalidEmail = { ...outboundEmail, references: 'a string' } as unknown as EmailOutbound
        expect(() => formatEmailOutbound(invalidEmail, from)).toThrow()
      })

      test('expect error on invalid subject', () => {
        const invalidEmail = { ...outboundEmail, subject: undefined } as unknown as EmailOutbound
        expect(() => formatEmailOutbound(invalidEmail, from)).toThrow()
      })

      test('expect error on invalid text', () => {
        const invalidEmail = { ...outboundEmail, text: undefined } as unknown as EmailOutbound
        expect(() => formatEmailOutbound(invalidEmail, from)).toThrow()
      })
    })
  })

  describe('event', () => {
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

    describe('extractEmailOutboundFromEvent', () => {
      const event = postEventJson as unknown as APIGatewayProxyEventV2

      test('expect email from event', () => {
        const result = extractEmailOutboundFromEvent(event, from)
        expect(result).toEqual(outboundEmail)
      })

      test('expect email from event in base64', () => {
        const tempEvent = {
          ...event,
          body: Buffer.from(event.body).toString('base64'),
          isBase64Encoded: true,
        } as unknown as APIGatewayProxyEventV2
        const result = extractEmailOutboundFromEvent(tempEvent, from)
        expect(result).toEqual(outboundEmail)
      })

      test('expect reject on invalid event', () => {
        const tempEvent = { ...event, body: JSON.stringify({}) } as unknown as APIGatewayProxyEventV2
        expect(() => extractEmailOutboundFromEvent(tempEvent, from)).toThrow()
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
})
