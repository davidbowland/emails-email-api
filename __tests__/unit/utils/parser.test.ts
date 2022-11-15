import { emailId, parsedContents } from '../__mocks__'
import { ParsedMail } from '@types'
import { convertParsedContentsToEmail } from '@utils/parser'

describe('parser', () => {
  describe('convertParsedContentsToEmail', () => {
    test('expect contents converted correctly', async () => {
      const result = await convertParsedContentsToEmail(emailId, parsedContents)
      expect(result).toEqual({
        attachments: [
          { filename: 'alexa-screenshot.png', id: 'f_kx2qxtrl0', size: 25277, type: 'attachment' },
          { filename: 'unknown', id: 'i87trdcvbnmnbfdfyujigf', size: 45678, type: 'attachment' },
        ],
        bodyHtml:
          '<a href="http://www.gutenberg.org/files/8164/8164-h/8164-h.htm">http://www.gutenberg.org/files/8164/8164-h/8164-h.htm</a>\n',
        bodyText: 'http://www.gutenberg.org/files/8164/8164-h/8164-h.htm\n',
        ccAddress: ['cc@domain.com'],
        date: '2018-08-06T00:58:58.000Z',
        fromAddress: {
          html: '<span class="mp_address_group"><span class="mp_address_name">Another Person</span> &lt;<a href="mailto:another@domain.com" class="mp_address_email">another@domain.com</a>&gt;</span>',
          text: 'Another Person <another@domain.com>',
          value: [
            {
              address: 'another@domain.com',
              name: 'Another Person',
            },
          ],
        },
        headers: {},
        id: '7yh8g-7ytguy-98ui8u-5efka-87y87y',
        inReplyTo: undefined,
        references: [],
        replyToAddress: {
          display: '',
          value: [
            {
              address: '',
              name: '',
            },
          ],
        },
        subject: 'P G Wodehouse',
        toAddress: {
          html: '<span class="mp_address_group"><a href="mailto:account@domain.com" class="mp_address_email">account@domain.com</a></span>',
          text: 'account@domain.com',
          value: [
            {
              address: 'account@domain.com',
              name: '',
            },
          ],
        },
      })
    })

    test('expect default values', async () => {
      const reference = 'fnord'
      const tempContents = {
        ...parsedContents,
        from: undefined,
        html: undefined,
        messageId: undefined,
        references: reference,
        text: undefined,
        textAsHtml: false,
      } as unknown as ParsedMail
      const result = await convertParsedContentsToEmail(emailId, tempContents)
      expect(result.bodyHtml).toEqual('')
      expect(result.bodyText).toEqual('')
      expect(result.fromAddress).toEqual({ html: '', text: '', value: [{ address: '', name: '' }] })
      expect(result.id).toEqual(emailId)
      expect(result.references).toEqual([reference])
    })
  })
})
