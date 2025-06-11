import { account, attachmentId, email, emailContents, emailId, jsonPatchOperations, outboundEmail } from '../__mocks__'
import patchEventJson from '@events/patch-account.json'
import putAccountEventJson from '@events/put-account.json'
import getEventJson from '@events/received/get-email.json'
import putEmailEventJson from '@events/received/put-email.json'
import postEventJson from '@events/sent/post-email.json'
import { Account, APIGatewayProxyEventV2, Email, EmailAttachment, EmailOutbound } from '@types'
import {
  convertOutboundToContents,
  convertOutboundToEmail,
  extractAccountFromEvent,
  extractEmailFromEvent,
  extractEmailOutboundFromEvent,
  extractJsonPatchFromEvent,
  extractJwtFromEvent,
  formatAccount,
  formatEmail,
  formatEmailOutbound,
  validateUsernameInEvent,
} from '@utils/events'

describe('events', () => {
  const from = {
    address: 'account@domain.com',
    name: 'Any',
  }

  describe('account', () => {
    describe('formatAccount', () => {
      it('should format account correctly', () => {
        const accountWithExtra = { ...account, something: 'invalid' } as unknown as Account
        const formattedAccount = formatAccount(accountWithExtra)

        expect(formattedAccount).toEqual({ forwardTargets: ['any@domain.com'], name: 'Any' })
      })

      it.each([undefined, 'a string'])('should throw error on invalid forwardTargets - %s', (forwardTargets) => {
        const invalidAccount = { ...account, forwardTargets } as unknown as Account

        expect(() => formatAccount(invalidAccount)).toThrow()
      })

      it.each([undefined, ''])('should throw error on invalid name - %s', (name) => {
        const invalidAccount = { ...account, name } as unknown as Account

        expect(() => formatAccount(invalidAccount)).toThrow()
      })
    })
  })

  describe('email', () => {
    describe('convertOutboundToContents', () => {
      const timestamp = 1533517138000

      it('should convert outbound email correctly', () => {
        const result = convertOutboundToContents(emailId, outboundEmail, timestamp)

        expect(result).toEqual(emailContents)
      })

      it('should convert outbound email with empty addresses', () => {
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
          }),
        )
      })
    })

    describe('convertOutboundToEmail', () => {
      test('expect outbound email converted', () => {
        const result = convertOutboundToEmail(outboundEmail)

        expect(result).toEqual(
          expect.objectContaining({
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
            bcc: ['bcc@domain.com'],
            cc: ['cc@domain.com'],
            from: 'account@domain.com',
            subject: 'Hello, world!',
            to: ['another@domain.com'],
            viewed: false,
          }),
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
          }),
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

      test('expect error on invalid attachments', () => {
        const invalidEmail = { ...email, attachments: 'a string' } as unknown as Email

        expect(() => formatEmail(invalidEmail)).toThrow()
      })

      test('expect error on invalid attachment filename', () => {
        const invalidEmail = { ...email, attachments: [{ ...attachment, filename: undefined }] } as unknown as Email

        expect(() => formatEmail(invalidEmail)).toThrow()
      })

      test('expect error on invalid attachment id', () => {
        const invalidEmail = { ...email, attachments: [{ ...attachment, id: undefined }] } as unknown as Email

        expect(() => formatEmail(invalidEmail)).toThrow()
      })

      test('expect error on invalid attachment size', () => {
        const invalidEmail = { ...email, attachments: [{ ...attachment, size: undefined }] } as unknown as Email

        expect(() => formatEmail(invalidEmail)).toThrow()
      })

      test('expect error on invalid attachment type', () => {
        const invalidEmail = { ...email, attachments: [{ ...attachment, type: undefined }] } as unknown as Email

        expect(() => formatEmail(invalidEmail)).toThrow()
      })

      test('expect timestamp when none provided', () => {
        const emailWithoutTimestamp = { ...email, timestamp: undefined } as unknown as Email
        const formattedEmail = formatEmail(emailWithoutTimestamp)

        expect(formattedEmail.timestamp).toBeDefined()
      })
    })

    describe('formatEmailOutbound', () => {
      const firstAttachment = outboundEmail.attachments[0]

      test('expect formatted email', () => {
        const emailWithInvalid = { ...outboundEmail, something: 'invalid' } as unknown as EmailOutbound
        const formattedEmail = formatEmailOutbound(emailWithInvalid, from)

        expect(formattedEmail).toEqual({
          attachments: [
            {
              checksum: '335a8335831f08e391d3a1d38a3167c9',
              cid: 'f_kx2qxtrl0',
              content: {
                data: [130],
                type: 'Buffer',
              },
              contentDisposition: 'attachment',
              contentId: '<f_kx2qxtrl0>',
              contentType: 'image/png',
              filename: 'alexa-screenshot.png',
              headerLines: {},
              headers: {},
              related: undefined,
              size: 25277,
              type: 'attachment',
            },
            {
              checksum: 'i87trdcvbnmnbfdfyujigf',
              cid: undefined,
              content: {
                data: [130],
                type: 'Buffer',
              },
              contentDisposition: 'attachment',
              contentId: '<f_kx2qxtrl0>',
              contentType: 'image/png',
              filename: undefined,
              headerLines: {},
              headers: {},
              related: undefined,
              size: 45678,
              type: 'attachment',
            },
          ],
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

      test('expect error on invalid attachments', () => {
        const invalidEmail = { ...outboundEmail, attachments: 'a string' } as unknown as EmailOutbound

        expect(() => formatEmailOutbound(invalidEmail, from)).toThrow()
      })

      test('expect error on invalid attachment content', () => {
        const invalidEmail = {
          ...outboundEmail,
          attachments: [{ ...firstAttachment, content: undefined }],
        } as unknown as EmailOutbound

        expect(() => formatEmailOutbound(invalidEmail, from)).toThrow()
      })

      test('expect error on invalid attachment contentDisposition', () => {
        const invalidEmail = {
          ...outboundEmail,
          attachments: [{ ...firstAttachment, contentDisposition: undefined }],
        } as unknown as EmailOutbound

        expect(() => formatEmailOutbound(invalidEmail, from)).toThrow()
      })

      test('expect error on invalid attachment contentType', () => {
        const invalidEmail = {
          ...outboundEmail,
          attachments: [{ ...firstAttachment, contentType: undefined }],
        } as unknown as EmailOutbound

        expect(() => formatEmailOutbound(invalidEmail, from)).toThrow()
      })

      test('expect error on invalid attachment headerLines', () => {
        const invalidEmail = {
          ...outboundEmail,
          attachments: [{ ...firstAttachment, headerLines: undefined }],
        } as unknown as EmailOutbound

        expect(() => formatEmailOutbound(invalidEmail, from)).toThrow()
      })

      test('expect error on invalid attachment headers', () => {
        const invalidEmail = {
          ...outboundEmail,
          attachments: [{ ...firstAttachment, headers: undefined }],
        } as unknown as EmailOutbound

        expect(() => formatEmailOutbound(invalidEmail, from)).toThrow()
      })

      test('expect error on invalid attachment size', () => {
        const invalidEmail = {
          ...outboundEmail,
          attachments: [{ ...firstAttachment, size: undefined }],
        } as unknown as EmailOutbound

        expect(() => formatEmailOutbound(invalidEmail, from)).toThrow()
      })
    })
  })

  describe('event', () => {
    describe('extractAccountFromEvent', () => {
      const event = putAccountEventJson as unknown as APIGatewayProxyEventV2

      it('should extract account from event', () => {
        const result = extractAccountFromEvent(event)

        expect(result).toEqual(account)
      })

      it('should extract account from base64 encoded event', () => {
        const tempEvent = {
          ...event,
          body: Buffer.from(event.body).toString('base64'),
          isBase64Encoded: true,
        } as unknown as APIGatewayProxyEventV2
        const result = extractAccountFromEvent(tempEvent)

        expect(result).toEqual(account)
      })

      it('should reject invalid event', () => {
        const tempEvent = { ...event, body: JSON.stringify({}) } as unknown as APIGatewayProxyEventV2

        expect(() => extractAccountFromEvent(tempEvent)).toThrow()
      })
    })

    describe('extractJsonPatchFromEvent', () => {
      it('should extract preference from event', () => {
        const result = extractJsonPatchFromEvent(patchEventJson as unknown as APIGatewayProxyEventV2)

        expect(result).toEqual(jsonPatchOperations)
      })
    })

    describe('extractJwtFromEvent', () => {
      it('should successfully extract payload', () => {
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

      it('should return null on invalid JWT', () => {
        const result = extractJwtFromEvent({
          ...getEventJson,
          headers: {
            authorization: 'Bearer invalid jwt',
          },
        } as unknown as APIGatewayProxyEventV2)

        expect(result).toBeNull()
      })

      it('should return null on missing header', () => {
        const event = { ...getEventJson, headers: {} } as unknown as APIGatewayProxyEventV2
        const result = extractJwtFromEvent(event)

        expect(result).toBeNull()
      })
    })

    describe('extractEmailFromEvent', () => {
      const event = putEmailEventJson as unknown as APIGatewayProxyEventV2

      it('should extract email from event', () => {
        const result = extractEmailFromEvent(event)

        expect(result).toEqual(email)
      })

      it('should extract email from base64 encoded event', () => {
        const tempEvent = {
          ...event,
          body: Buffer.from(event.body).toString('base64'),
          isBase64Encoded: true,
        } as unknown as APIGatewayProxyEventV2
        const result = extractEmailFromEvent(tempEvent)

        expect(result).toEqual(email)
      })

      it('should reject invalid event', () => {
        const tempEvent = { ...event, body: JSON.stringify({}) } as unknown as APIGatewayProxyEventV2

        expect(() => extractEmailFromEvent(tempEvent)).toThrow()
      })
    })

    describe('extractEmailOutboundFromEvent', () => {
      const event = postEventJson as unknown as APIGatewayProxyEventV2

      it('should extract email from event', () => {
        const result = extractEmailOutboundFromEvent(event, from)

        expect(result).toEqual(outboundEmail)
      })

      it('should extract email from base64 encoded event', () => {
        const tempEvent = {
          ...event,
          body: Buffer.from(event.body).toString('base64'),
          isBase64Encoded: true,
        } as unknown as APIGatewayProxyEventV2
        const result = extractEmailOutboundFromEvent(tempEvent, from)

        expect(result).toEqual(outboundEmail)
      })

      it('should reject invalid event', () => {
        const tempEvent = { ...event, body: JSON.stringify({}) } as unknown as APIGatewayProxyEventV2

        expect(() => extractEmailOutboundFromEvent(tempEvent, from)).toThrow()
      })
    })

    describe('validateUsernameInEvent', () => {
      const username = 'admin'

      it('should return true when external and matching', () => {
        const result = validateUsernameInEvent(getEventJson as unknown as APIGatewayProxyEventV2, username)

        expect(result).toEqual(true)
      })

      it('should return false when external and not matching', () => {
        const result = validateUsernameInEvent(getEventJson as unknown as APIGatewayProxyEventV2, 'not-matching')

        expect(result).toEqual(false)
      })

      it('should return true when internal', () => {
        const event = {
          ...getEventJson,
          requestContext: {
            domainPrefix: 'localhost',
          },
        } as unknown as APIGatewayProxyEventV2
        const result = validateUsernameInEvent(event, username)

        expect(result).toEqual(true)
      })
    })
  })
})
