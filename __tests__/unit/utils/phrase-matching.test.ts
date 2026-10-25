import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'

import vectors from '../phrase-matching-vectors.json'
import { containsPhrase, createPhraseMatcher, toWords } from '@utils/phrase-matching'

interface PhraseVector {
  expected: boolean
  note: string
  phrase: string
  text: string
}

describe('phrase-matching', () => {
  describe('toWords', () => {
    it('should lowercase and split on punctuation and whitespace', () => {
      expect(toWords('Reply with "NO" -- USD 12/hour!')).toEqual(['reply', 'with', 'no', 'usd', '12', 'hour'])
    })

    it('should delete apostrophes rather than splitting on them', () => {
      expect(toWords("won\u2019t don't")).toEqual(['wont', 'dont'])
    })

    it('should remove zero-width characters', () => {
      expect(toWords('e\u200Bx\u200Ca\u200Dm\u2060p\uFEFFle')).toEqual(['example'])
    })

    it('should remove every format character, including the soft hyphen and bidi controls', () => {
      expect(toWords('What\u00ADsApp ex\u202Eam\u202Cple')).toEqual(['whatsapp', 'example'])
    })

    it('should keep the combining dot of a lowercased dotted capital I inside the word', () => {
      expect(toWords('İstanbul')).toHaveLength(1)
      expect(toWords('Visit İstanbul today')).toEqual(['visit', toWords('İstanbul')[0], 'today'])
    })

    it('should keep Devanagari vowel signs and viramas inside the word', () => {
      expect(toWords('नमस्ते दुनिया')).toEqual(['नमस्ते', 'दुनिया'])
    })

    it('should return no words for symbol-only input', () => {
      expect(toWords('!!! ??? ...')).toEqual([])
    })

    it('should return no words for an empty string', () => {
      expect(toWords('')).toEqual([])
    })
  })

  describe('createPhraseMatcher', () => {
    it('should check many phrases against one text', () => {
      const matches = createPhraseMatcher(toWords('Grow your business with SEO'))

      expect(matches(['your', 'business'])).toBe(true)
      expect(matches(['seo'])).toBe(true)
      expect(matches(['business', 'your'])).toBe(false)
      expect(matches([])).toBe(false)
    })
  })

  describe('containsPhrase', () => {
    it('should match consecutive words', () => {
      expect(containsPhrase(['a', 'quick', 'question', 'here'], ['quick', 'question'])).toBe(true)
    })

    it('should match a phrase hidden with a soft hyphen', () => {
      expect(containsPhrase(toWords('Message me on What\u00ADsApp'), toWords('whatsapp'))).toBe(true)
    })

    it('should not match a partial word', () => {
      expect(containsPhrase(['happy'], ['app'])).toBe(false)
    })

    it('should not match when the phrase has no words', () => {
      expect(containsPhrase(['anything'], [])).toBe(false)
    })

    it('should not match when the phrase is longer than the text', () => {
      expect(containsPhrase(['one'], ['one', 'two'])).toBe(false)
    })

    // Two sibling repos keep identical copies of this file and pin the same hash, so every matcher is tested
    // against the same cases. Change all copies together and update every hash.
    it('should match the hash pinned in both repos', () => {
      const file = readFileSync(join(__dirname, '../phrase-matching-vectors.json'))

      expect(createHash('sha256').update(file).digest('hex')).toEqual(
        '5dd99f289e03d75e07ab265b3e01dfe204689abce0bbce5368a903ac591ade78',
      )
    })

    it.each(vectors as PhraseVector[])('vector: $note', ({ expected, phrase, text }) => {
      expect(containsPhrase(toWords(text), toWords(phrase))).toBe(expected)
    })
  })
})
