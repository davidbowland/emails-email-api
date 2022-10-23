import { emailId, parsedContents } from '../__mocks__'
import { ParsedMail } from '@types'
import { convertParsedContentsToEmail } from '@utils/parser'

describe('parser', () => {
  describe('convertParsedContentsToEmail', () => {
    test('expect contents converted correctly', async () => {
      const result = await convertParsedContentsToEmail(emailId, parsedContents)
      expect(result).toEqual({
        bodyHtml:
          '<a href="http://www.gutenberg.org/files/8164/8164-h/8164-h.htm">http://www.gutenberg.org/files/8164/8164-h/8164-h.htm</a>\n',
        bodyText: 'http://www.gutenberg.org/files/8164/8164-h/8164-h.htm\n',
        ccAddress: undefined,
        fromAddress: {
          display: 'Person A <a@person.email>',
          value: [
            {
              address: 'a@person.email',
              name: 'Person A',
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
          display: 'Person B <b@person.email>',
          value: [
            {
              address: 'b@person.email',
              name: 'Person B',
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
      expect(result.fromAddress).toEqual({ display: '', value: [{ address: '', name: '' }] })
      expect(result.id).toEqual(emailId)
      expect(result.references).toEqual([reference])
    })
  })
})
