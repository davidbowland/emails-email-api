import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'

import vectors from '../spam-body-vectors.json'
import { ParsedMail } from '@types'
import { getBodyParts, htmlToText, MAX_SCORED_TEXT_LENGTH } from '@utils/spam-body'

interface RepeatedText {
  repeatChar: string
  repeatCount: number
}

// A vector string is either literal or a repeated character, which keeps the 64 KB cases out of the file
const resolveText = (value: string | RepeatedText | undefined): string | undefined =>
  typeof value === 'object' ? value.repeatChar.repeat(value.repeatCount) : value

describe('spam-body', () => {
  // Two sibling repos keep identical copies of this file and pin the same hash, so every implementation is tested
  // against the same cases. Change all copies together and update every hash.
  it('should match the vector hash pinned in both repos', () => {
    const file = readFileSync(join(__dirname, '../spam-body-vectors.json'))

    expect(createHash('sha256').update(file).digest('hex')).toEqual(
      '5ea7abbe933903fd26c6ff5dbd5052b6810fff7fc56920810f7a9ed83627b179',
    )
  })

  describe('MAX_SCORED_TEXT_LENGTH', () => {
    it('should be 64 KB', () => {
      expect(MAX_SCORED_TEXT_LENGTH).toEqual(65_536)
    })
  })

  describe('getBodyParts', () => {
    it.each(vectors.bodyParts)('vector: $note', ({ expected, html, text }) => {
      const parsed = { html: resolveText(html), text: resolveText(text) } as unknown as ParsedMail

      expect(getBodyParts(parsed)).toEqual(expected.map(resolveText))
    })

    it.each([undefined, null, 42, false])('should ignore a non-string part - %p', (value) => {
      expect(getBodyParts({ html: value, text: value } as unknown as ParsedMail)).toEqual([])
    })
  })

  describe('htmlToText', () => {
    it('should replace tags with spaces', () => {
      expect(htmlToText('<p>one</p><p>two</p>')).toEqual(' one  two ')
    })

    it('should drop script and style blocks', () => {
      expect(htmlToText('a<script>hidden</script>b<style>hidden</style>c')).toEqual('a b c')
    })

    it('should drop everything after an unterminated script', () => {
      expect(htmlToText('keep<script>hidden')).toEqual('keep')
    })

    it('should not let a closing style tag end a script', () => {
      expect(htmlToText('<script>a</style>b</script>c')).toEqual(' c')
    })

    it('should decode named entities', () => {
      expect(htmlToText('a&nbsp;b&lt;c&gt;&quot;&apos;')).toEqual('a b<c>"\'')
    })

    it('should decode decimal and hex entities', () => {
      expect(htmlToText('&#233;&#xE9;')).toEqual('éé')
    })

    it('should replace an entity beyond the Unicode range with a space', () => {
      expect(htmlToText('a&#9999999;b')).toEqual('a b')
    })

    it('should keep an escaped numeric entity literal', () => {
      expect(htmlToText('&amp;#8203;')).toEqual('&#8203;')
    })
  })
})
