import {
  account,
  attachmentId,
  email,
  emailContents,
  emailId,
  jsonPatchOperations,
  outboundEmail,
  pushSubscription,
} from '../__mocks__'
import patchEventJson from '@events/patch-account.json'
import putAccountEventJson from '@events/put-account.json'
import getEventJson from '@events/received/get-email.json'
import putEmailEventJson from '@events/received/put-email.json'
import postEventJson from '@events/sent/post-email.json'
import {
  Account,
  APIGatewayProxyEventV2,
  Email,
  EmailAttachment,
  EmailOutbound,
  PushSubscription,
  SpamFilter,
} from '@types'
import {
  convertOutboundToContents,
  convertOutboundToEmail,
  extractAccountFromEvent,
  extractEmailFromEvent,
  extractEmailOutboundFromEvent,
  extractJsonPatchFromEvent,
  extractJwtFromEvent,
  extractPushSubscriptionFromEvent,
  formatAccount,
  formatEmail,
  formatEmailOutbound,
  formatPushSubscription,
  formatSpamFilter,
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

        expect(formattedAccount).toEqual({
          bounceSenders: [],
          forwardTargets: ['any@domain.com'],
          name: 'Any',
          notificationPreview: 'sender-and-subject',
          spamFilter: { blockPhrases: [], sensitivity: 'medium', trustedSenders: [] },
        })
      })

      it('should carry a valid spamFilter through', () => {
        const spamFilter: SpamFilter = {
          blockPhrases: ['act now'],
          sensitivity: 'high',
          trustedSenders: ['@domain.com'],
        }
        const formattedAccount = formatAccount({ ...account, spamFilter })

        expect(formattedAccount.spamFilter).toEqual(spamFilter)
      })

      it('should keep the stored spamFilter when the account has none', () => {
        const storedSpamFilter: SpamFilter = { blockPhrases: ['act now'], sensitivity: 'low', trustedSenders: [] }
        const accountWithoutSpamFilter = { ...account, spamFilter: undefined } as unknown as Account
        const formattedAccount = formatAccount(accountWithoutSpamFilter, storedSpamFilter)

        expect(formattedAccount.spamFilter).toEqual(storedSpamFilter)
      })

      it('should default the spamFilter when the account has none and nothing is stored', () => {
        const accountWithoutSpamFilter = { ...account, spamFilter: undefined } as unknown as Account
        const formattedAccount = formatAccount(accountWithoutSpamFilter)

        expect(formattedAccount.spamFilter).toEqual({ blockPhrases: [], sensitivity: 'medium', trustedSenders: [] })
      })

      it.each([null, 'a string', { ...account.spamFilter, sensitivity: 'extreme' }])(
        'should throw error on invalid spamFilter - %s',
        (spamFilter) => {
          const invalidAccount = { ...account, spamFilter } as unknown as Account

          expect(() => formatAccount(invalidAccount)).toThrow()
        },
      )

      it('should carry a valid notificationPreview through', () => {
        const accountWithPreference = { ...account, notificationPreview: 'sender-only' } as Account
        const formattedAccount = formatAccount(accountWithPreference)

        expect(formattedAccount.notificationPreview).toEqual('sender-only')
      })

      it.each([undefined, 'everything'])(
        'should fall back to the quietest notificationPreview on write - %s',
        (notificationPreview) => {
          const accountWithBadPreference = { ...account, notificationPreview } as unknown as Account
          const formattedAccount = formatAccount(accountWithBadPreference)

          expect(formattedAccount.notificationPreview).toEqual('none')
        },
      )

      it.each([undefined, 'a string'])('should throw error on invalid forwardTargets - %s', (forwardTargets) => {
        const invalidAccount = { ...account, forwardTargets } as unknown as Account

        expect(() => formatAccount(invalidAccount)).toThrow()
      })

      it.each([undefined, ''])('should throw error on invalid name - %s', (name) => {
        const invalidAccount = { ...account, name } as unknown as Account

        expect(() => formatAccount(invalidAccount)).toThrow()
      })

      it.each([undefined, 'a string'])('should throw error on invalid bounceSenders - %s', (bounceSenders) => {
        const invalidAccount = { ...account, bounceSenders } as unknown as Account

        expect(() => formatAccount(invalidAccount)).toThrow()
      })
    })
  })

  describe('spam filter', () => {
    describe('formatSpamFilter', () => {
      const spamFilter: SpamFilter = { blockPhrases: [], sensitivity: 'medium', trustedSenders: [] }
      const hundredEntries = Array.from({ length: 100 }, (_, index) => `phrase ${index}`)
      const tooManyEntries = [...hundredEntries, 'one more']

      it('should drop unknown fields', () => {
        const spamFilterWithExtra = { ...spamFilter, something: 'invalid' } as unknown as SpamFilter

        expect(formatSpamFilter(spamFilterWithExtra)).toEqual(spamFilter)
      })

      it.each(['low', 'medium', 'high'])('should accept sensitivity - %s', (sensitivity) => {
        const result = formatSpamFilter({ ...spamFilter, sensitivity } as SpamFilter)

        expect(result.sensitivity).toEqual(sensitivity)
      })

      it.each([undefined, 'extreme', 'MEDIUM', 2])('should reject sensitivity - %s', (sensitivity) => {
        const invalidSpamFilter = { ...spamFilter, sensitivity } as unknown as SpamFilter

        expect(() => formatSpamFilter(invalidSpamFilter)).toThrow('spamFilter.sensitivity must be one of')
      })

      it.each([undefined, null, 'a string', [], 7])(
        'should reject a spamFilter that is not an object - %s',
        (value) => {
          expect(() => formatSpamFilter(value as unknown as SpamFilter)).toThrow('spamFilter must be an object')
        },
      )

      it('should accept 100 entries of 100 characters', () => {
        const longest = 'a'.repeat(100)
        const result = formatSpamFilter({ ...spamFilter, blockPhrases: [...hundredEntries.slice(1), longest] })

        expect(result.blockPhrases).toHaveLength(100)
      })

      it.each(['blockPhrases', 'trustedSenders'])('should reject a %s that is not an array', (name) => {
        const invalidSpamFilter = { ...spamFilter, [name]: 'a string' } as unknown as SpamFilter

        expect(() => formatSpamFilter(invalidSpamFilter)).toThrow(`spamFilter.${name} must be an array of strings`)
      })

      it.each(['blockPhrases', 'trustedSenders'])('should reject a %s with more than 100 entries', (name) => {
        const invalidSpamFilter = { ...spamFilter, [name]: tooManyEntries } as unknown as SpamFilter

        expect(() => formatSpamFilter(invalidSpamFilter)).toThrow(`spamFilter.${name} must have 100 entries or fewer`)
      })

      it.each(['blockPhrases', 'trustedSenders'])('should reject a %s with non-string entries', (name) => {
        const invalidSpamFilter = { ...spamFilter, [name]: ['valid.com', 42] } as unknown as SpamFilter

        expect(() => formatSpamFilter(invalidSpamFilter)).toThrow(`spamFilter.${name} must be an array of strings`)
      })

      it.each([
        ['blockPhrases', 'a'.repeat(101)],
        ['trustedSenders', `${'a'.repeat(97)}.com`],
      ])('should reject a %s entry longer than 100 characters', (name, entry) => {
        const invalidSpamFilter = { ...spamFilter, [name]: [entry] } as unknown as SpamFilter

        expect(() => formatSpamFilter(invalidSpamFilter)).toThrow(
          `spamFilter.${name} entries must be 100 characters or fewer`,
        )
      })

      it.each(['act now', 'USD 12/hour', "won't", '42', 'café', 'привет', '中文'])(
        'should accept block phrase - %s',
        (phrase) => {
          const result = formatSpamFilter({ ...spamFilter, blockPhrases: [phrase] })

          expect(result.blockPhrases).toEqual([phrase])
        },
      )

      it('should accept a block phrase whose only letter appears after NFKC normalization', () => {
        const result = formatSpamFilter({ ...spamFilter, blockPhrases: ['ⓐ'] })

        expect(result.blockPhrases).toEqual(['ⓐ'])
      })

      it.each(['', '   ', '!!!', '$$ --', '…'])(
        'should reject block phrase without a letter or digit - %s',
        (phrase) => {
          const invalidSpamFilter = { ...spamFilter, blockPhrases: [phrase] }

          expect(() => formatSpamFilter(invalidSpamFilter)).toThrow(
            'spamFilter.blockPhrases entries must contain at least one letter or number',
          )
        },
      )

      it.each([
        'user@domain.com',
        'first.last+tag@mail.domain.co.uk',
        "o'brien@corp.com",
        '@domain.com',
        'domain.com',
        'mail.domain.com',
      ])('should accept trusted sender - %s', (sender) => {
        const result = formatSpamFilter({ ...spamFilter, trustedSenders: [sender] })

        expect(result.trustedSenders).toEqual([sender])
      })

      it.each([
        '*',
        '*@domain.com',
        '@*.com',
        '*.domain.com',
        'com',
        '@com',
        'user@domain',
        'user@',
        '@',
        '',
        'user name@domain.com',
        'user@@domain.com',
        'domain..com',
        '.domain.com',
        'domain.com.',
        'a,b@domain.com',
        'user@do;main.com',
        '<user@domain.com>',
        '"user"@domain.com',
        "user@o'brien.com",
        "@o'brien.com",
        "o'brien.com",
        'user(x)@domain.com',
        'ex\u200bample.com',
      ])('should reject trusted sender - "%s"', (sender) => {
        const invalidSpamFilter = { ...spamFilter, trustedSenders: [sender] }

        expect(() => formatSpamFilter(invalidSpamFilter)).toThrow(
          'spamFilter.trustedSenders entries must be an email address, an @domain or a domain',
        )
      })
    })
  })

  describe('push subscriptions', () => {
    describe('formatPushSubscription', () => {
      it('should return only endpoint and keys', () => {
        const subscriptionWithExtra = { ...pushSubscription, expirationTime: 12345 } as PushSubscription

        expect(formatPushSubscription(subscriptionWithExtra)).toEqual({
          endpoint: 'https://push.example.com/subscription/first',
          keys: { auth: 'auth-secret-first', p256dh: 'p256dh-key-first' },
        })
      })

      // Every case asserts the message, not just that something threw: each rejection has its own
      // reason, and a bare toThrow() would pass on the wrong one -- an over-long endpoint caught by
      // the https check, say, or a missing key caught by the endpoint check.
      it.each([
        [undefined, 'subscription.endpoint must be a non-empty string'],
        ['', 'subscription.endpoint must be a non-empty string'],
        [42, 'subscription.endpoint must be a non-empty string'],
        ['http://push.example.com/subscription', 'subscription.endpoint must be an https URL'],
      ])('should throw on invalid endpoint - %s', (endpoint, message) => {
        const invalid = { ...pushSubscription, endpoint } as unknown as PushSubscription

        expect(() => formatPushSubscription(invalid)).toThrow(message)
      })

      it('should throw on an endpoint longer than 2048 characters', () => {
        const invalid = {
          ...pushSubscription,
          endpoint: `https://push.example.com/${'a'.repeat(2048)}`,
        } as PushSubscription

        expect(() => formatPushSubscription(invalid)).toThrow('subscription.endpoint must be 2048 characters or fewer')
      })

      it.each([
        [undefined, 'subscription.keys.p256dh must be a non-empty string'],
        [{}, 'subscription.keys.p256dh must be a non-empty string'],
        [{ auth: 'auth-secret-first' }, 'subscription.keys.p256dh must be a non-empty string'],
        [{ p256dh: 'p256dh-key-first' }, 'subscription.keys.auth must be a non-empty string'],
      ])('should throw on invalid keys - %s', (keys, message) => {
        const invalid = { ...pushSubscription, keys } as unknown as PushSubscription

        expect(() => formatPushSubscription(invalid)).toThrow(message)
      })

      it('should throw on a missing subscription', () => {
        expect(() => formatPushSubscription(undefined as unknown as PushSubscription)).toThrow(
          'subscription.endpoint must be a non-empty string',
        )
      })
    })

    describe('extractPushSubscriptionFromEvent', () => {
      it('should extract the subscription from the body', () => {
        const event = { body: JSON.stringify({ subscription: pushSubscription }) } as APIGatewayProxyEventV2

        expect(extractPushSubscriptionFromEvent(event)).toEqual(pushSubscription)
      })

      it('should extract the subscription from a base64 body', () => {
        const event = {
          body: Buffer.from(JSON.stringify({ subscription: pushSubscription })).toString('base64'),
          isBase64Encoded: true,
        } as APIGatewayProxyEventV2

        expect(extractPushSubscriptionFromEvent(event)).toEqual(pushSubscription)
      })

      it('should throw on a body with no subscription', () => {
        const event = { body: JSON.stringify({}) } as APIGatewayProxyEventV2

        expect(() => extractPushSubscriptionFromEvent(event)).toThrow()
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
      it('should convert outbound email correctly', () => {
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

      it('should convert outbound email with empty address', () => {
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

      it('should format email correctly', () => {
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

      it.each(['inbox', 'spam'])('should keep folder - %s', (folder) => {
        const formattedEmail = formatEmail({ ...email, folder } as Email)

        expect(formattedEmail.folder).toEqual(folder)
      })

      it('should leave folder absent when none provided', () => {
        const formattedEmail = formatEmail(email)

        expect(formattedEmail.folder).toBeUndefined()
      })

      it.each(['junk', 'Spam', '', null])('should throw error on invalid folder - %s', (folder) => {
        const invalidEmail = { ...email, folder } as unknown as Email

        expect(() => formatEmail(invalidEmail)).toThrow('folder must be one of inbox, spam, when present')
      })

      it('should throw error on invalid to', () => {
        const invalidEmail = { ...email, to: 'a string' } as unknown as Email

        expect(() => formatEmail(invalidEmail)).toThrow()
      })

      it('should throw error on invalid cc', () => {
        const invalidEmail = { ...email, cc: 'a string' } as unknown as Email

        expect(() => formatEmail(invalidEmail)).toThrow()
      })

      it('should throw error on invalid bcc', () => {
        const invalidEmail = { ...email, bcc: 'a string' } as unknown as Email

        expect(() => formatEmail(invalidEmail)).toThrow()
      })

      it('should throw error on missing to, cc, and bcc', () => {
        const invalidEmail = { ...email, bcc: undefined, cc: undefined, to: undefined } as unknown as Email

        expect(() => formatEmail(invalidEmail)).toThrow()
      })

      it('should throw error on invalid from', () => {
        const invalidEmail = { ...email, from: undefined } as unknown as Email

        expect(() => formatEmail(invalidEmail)).toThrow()
      })

      it('should throw error on invalid subject', () => {
        const invalidEmail = { ...email, subject: undefined } as unknown as Email

        expect(() => formatEmail(invalidEmail)).toThrow()
      })

      it('should throw error on invalid attachments', () => {
        const invalidEmail = { ...email, attachments: 'a string' } as unknown as Email

        expect(() => formatEmail(invalidEmail)).toThrow()
      })

      it('should throw error on invalid attachment filename', () => {
        const invalidEmail = { ...email, attachments: [{ ...attachment, filename: undefined }] } as unknown as Email

        expect(() => formatEmail(invalidEmail)).toThrow()
      })

      it('should throw error on invalid attachment id', () => {
        const invalidEmail = { ...email, attachments: [{ ...attachment, id: undefined }] } as unknown as Email

        expect(() => formatEmail(invalidEmail)).toThrow()
      })

      it('should throw error on invalid attachment size', () => {
        const invalidEmail = { ...email, attachments: [{ ...attachment, size: undefined }] } as unknown as Email

        expect(() => formatEmail(invalidEmail)).toThrow()
      })

      it('should throw error on invalid attachment type', () => {
        const invalidEmail = { ...email, attachments: [{ ...attachment, type: undefined }] } as unknown as Email

        expect(() => formatEmail(invalidEmail)).toThrow()
      })

      it('should add timestamp when none provided', () => {
        const emailWithoutTimestamp = { ...email, timestamp: undefined } as unknown as Email
        const formattedEmail = formatEmail(emailWithoutTimestamp)

        expect(formattedEmail.timestamp).toBeDefined()
      })
    })

    describe('formatEmailOutbound', () => {
      const firstAttachment = outboundEmail.attachments[0]

      it('should format outbound email correctly', () => {
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

      it('should throw error on invalid to', () => {
        const invalidEmail = { ...outboundEmail, to: 'a string' } as unknown as EmailOutbound

        expect(() => formatEmailOutbound(invalidEmail, from)).toThrow()
      })

      it('should throw error on invalid cc', () => {
        const invalidEmail = { ...outboundEmail, cc: 'a string' } as unknown as EmailOutbound

        expect(() => formatEmailOutbound(invalidEmail, from)).toThrow()
      })

      it('should throw error on invalid bcc', () => {
        const invalidEmail = { ...outboundEmail, bcc: 'a string' } as unknown as EmailOutbound
        expect(() => formatEmailOutbound(invalidEmail, from)).toThrow()
      })

      it('should throw error on missing to, cc, and bcc', () => {
        const invalidEmail = {
          ...outboundEmail,
          bcc: undefined,
          cc: undefined,
          to: undefined,
        } as unknown as EmailOutbound

        expect(() => formatEmailOutbound(invalidEmail, from)).toThrow()
      })

      it('should throw error on invalid html', () => {
        const invalidEmail = { ...outboundEmail, html: undefined } as unknown as EmailOutbound

        expect(() => formatEmailOutbound(invalidEmail, from)).toThrow()
      })

      it('should throw error on invalid references', () => {
        const invalidEmail = { ...outboundEmail, references: 'a string' } as unknown as EmailOutbound

        expect(() => formatEmailOutbound(invalidEmail, from)).toThrow()
      })

      it('should throw error on invalid subject', () => {
        const invalidEmail = { ...outboundEmail, subject: undefined } as unknown as EmailOutbound

        expect(() => formatEmailOutbound(invalidEmail, from)).toThrow()
      })

      it('should throw error on invalid text', () => {
        const invalidEmail = { ...outboundEmail, text: undefined } as unknown as EmailOutbound

        expect(() => formatEmailOutbound(invalidEmail, from)).toThrow()
      })

      it('should throw error on invalid attachments', () => {
        const invalidEmail = { ...outboundEmail, attachments: 'a string' } as unknown as EmailOutbound

        expect(() => formatEmailOutbound(invalidEmail, from)).toThrow()
      })

      it('should throw error on invalid attachment content', () => {
        const invalidEmail = {
          ...outboundEmail,
          attachments: [{ ...firstAttachment, content: undefined }],
        } as unknown as EmailOutbound

        expect(() => formatEmailOutbound(invalidEmail, from)).toThrow()
      })

      it('should throw error on invalid attachment contentDisposition', () => {
        const invalidEmail = {
          ...outboundEmail,
          attachments: [{ ...firstAttachment, contentDisposition: undefined }],
        } as unknown as EmailOutbound

        expect(() => formatEmailOutbound(invalidEmail, from)).toThrow()
      })

      it('should throw error on invalid attachment contentType', () => {
        const invalidEmail = {
          ...outboundEmail,
          attachments: [{ ...firstAttachment, contentType: undefined }],
        } as unknown as EmailOutbound

        expect(() => formatEmailOutbound(invalidEmail, from)).toThrow()
      })

      it('should throw error on invalid attachment headerLines', () => {
        const invalidEmail = {
          ...outboundEmail,
          attachments: [{ ...firstAttachment, headerLines: undefined }],
        } as unknown as EmailOutbound

        expect(() => formatEmailOutbound(invalidEmail, from)).toThrow()
      })

      it('should throw error on invalid attachment headers', () => {
        const invalidEmail = {
          ...outboundEmail,
          attachments: [{ ...firstAttachment, headers: undefined }],
        } as unknown as EmailOutbound

        expect(() => formatEmailOutbound(invalidEmail, from)).toThrow()
      })

      it('should throw error on invalid attachment size', () => {
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

      // The body a device running a stale precached emails-ui bundle sends: the four fields that
      // predate notificationPreview. It must not raise the tier the account already chose.
      it('should fall back to the quietest tier for a body without notificationPreview', () => {
        const tempEvent = {
          ...event,
          body: JSON.stringify({ bounceSenders: [], forwardTargets: ['any@domain.com'], name: 'Any' }),
        } as unknown as APIGatewayProxyEventV2
        const result = extractAccountFromEvent(tempEvent)

        expect(result).toEqual({ ...account, notificationPreview: 'none' })
      })

      it('should keep the stored spamFilter for a body without spamFilter', () => {
        const storedSpamFilter: SpamFilter = { blockPhrases: ['act now'], sensitivity: 'high', trustedSenders: [] }
        const result = extractAccountFromEvent(event, storedSpamFilter)

        expect(result).toEqual({ ...account, spamFilter: storedSpamFilter })
      })

      it('should reject a body with an invalid spamFilter', () => {
        const tempEvent = {
          ...event,
          body: JSON.stringify({ ...account, spamFilter: { ...account.spamFilter, blockPhrases: ['!!!'] } }),
        } as unknown as APIGatewayProxyEventV2

        expect(() => extractAccountFromEvent(tempEvent)).toThrow(
          'spamFilter.blockPhrases entries must contain at least one letter or number',
        )
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

      it('should return an empty object on invalid JWT', () => {
        const result = extractJwtFromEvent({
          ...getEventJson,
          headers: {
            authorization: 'Bearer invalid jwt',
          },
        } as unknown as APIGatewayProxyEventV2)

        expect(result).toEqual({})
      })

      it('should return an empty object on missing header', () => {
        const event = { ...getEventJson, headers: {} } as unknown as APIGatewayProxyEventV2
        const result = extractJwtFromEvent(event)

        expect(result).toEqual({})
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

      // A bearer token this API cannot parse is a denied caller, not a crash. Returning false here is
      // what makes every route answer 403 for one, instead of each handler improvising a status from
      // whatever a TypeError happened to land in.
      it.each(['Bearer invalid jwt', 'not-even-a-bearer-token', ''])(
        'should return false for an unparseable bearer token - %s',
        (authorization) => {
          const event = { ...getEventJson, headers: { authorization } } as unknown as APIGatewayProxyEventV2

          expect(validateUsernameInEvent(event, username)).toEqual(false)
        },
      )
    })
  })
})
