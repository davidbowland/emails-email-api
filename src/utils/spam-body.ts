import type { ParsedMail } from '../types'

// Identical copy of the body-part helpers in emails-inbound-service's src/utils/spam-score.ts, so a preview here sees
// the same text the spam filter scores. Change both copies together: __tests__/unit/spam-body-vectors.json is an
// identical copy in both repos, pinned by SHA-256 in each repo's tests.

// ReDoS guard: every input is capped before any processing, and every pattern below is fixed with bounded
// quantifiers only.
export const MAX_SCORED_TEXT_LENGTH = 65_536
// The inbound filter (classifyEmail) matches only the first 1,024 characters of a subject. Not part of the inbound
// copy of these helpers; it lives here so spam-impact.ts and spam-suggestions.ts share it without importing each other.
export const SUBJECT_MATCH_LENGTH = 1_024

const HTML_TAG = /<[^<>]{0,2048}>/g
// Opening and closing <script>/<style> tags only; the blocks between them are cut by position, not by a regex
const HTML_HIDDEN_BLOCK_TAG = /<(\/?)(script|style)\b[^<>]{0,2048}>/gi
// &amp; is decoded last, on its own, so "&amp;#8203;" stays literal text instead of becoming a zero-width character
const HTML_NAMED_ENTITY = /&(nbsp|lt|gt|quot|apos|zwnj|zwj);/gi
const HTML_AMP_ENTITY = /&amp;/gi
const HTML_DECIMAL_ENTITY = /&#(\d{1,7});/g
const HTML_HEX_ENTITY = /&#x([0-9a-f]{1,6});/gi
const NAMED_ENTITIES: Record<string, string> = {
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
  zwj: '\u200D',
  zwnj: '\u200C',
}

const decodeCodePoint = (value: number): string => (value <= 0x10ffff ? String.fromCodePoint(value) : ' ')

// One linear pass over the opening/closing tags: text inside <script> or <style> is dropped, as is everything after
// an unterminated one. A closing tag only ends the block it matches (</style> does not end a <script>).
const stripHiddenBlocks = (html: string): string => {
  const final = Array.from(html.matchAll(HTML_HIDDEN_BLOCK_TAG)).reduce(
    (state: { inside?: string; kept: string[]; keepFrom: number }, match) => {
      const [tag, closing, rawName] = match
      const name = rawName.toLowerCase()
      const index = Number(match.index)
      if (state.inside === undefined && !closing) {
        return { inside: name, kept: [...state.kept, html.slice(state.keepFrom, index)], keepFrom: index }
      }
      if (state.inside === name && closing) {
        return { inside: undefined, kept: state.kept, keepFrom: index + tag.length }
      }
      return state
    },
    { inside: undefined, kept: [], keepFrom: 0 },
  )
  const tail = final.inside === undefined ? [html.slice(final.keepFrom)] : []
  return [...final.kept, ...tail].join(' ')
}

export const htmlToText = (html: string): string =>
  stripHiddenBlocks(html)
    .replace(HTML_TAG, ' ')
    .replace(HTML_NAMED_ENTITY, (_, name: string) => NAMED_ENTITIES[name.toLowerCase()])
    .replace(HTML_DECIMAL_ENTITY, (_, digits: string) => decodeCodePoint(parseInt(digits, 10)))
    .replace(HTML_HEX_ENTITY, (_, digits: string) => decodeCodePoint(parseInt(digits, 16)))
    .replace(HTML_AMP_ENTITY, '&')

const isString = (value: unknown): value is string => typeof value === 'string'

// The text part and the HTML part are both scored (AC-048): spam can hide in either. Each raw part is capped at 64 KB
// before any processing, and the HTML-derived text is capped again.
export const getBodyParts = (parsed: ParsedMail): string[] => {
  const text = isString(parsed.text) ? parsed.text.slice(0, MAX_SCORED_TEXT_LENGTH) : ''
  const html = isString(parsed.html)
    ? htmlToText(parsed.html.slice(0, MAX_SCORED_TEXT_LENGTH)).slice(0, MAX_SCORED_TEXT_LENGTH)
    : ''
  return [text, html].filter((part) => part.length > 0)
}
