const FORMAT_CHARACTERS = /\p{Cf}/gu
const CONTROL_CHARACTERS_EXCEPT_NEWLINE_AND_TAB = /(?![\n\t])\p{Cc}/gu

// Removes invisible format characters (zero-width, bidi controls, tag characters) and replaces other control
// characters with a space, so text shown to a person cannot hide or reorder content. Newlines and tabs stay.
export const sanitizeEmailText = (text: string): string =>
  text.replace(FORMAT_CHARACTERS, '').replace(CONTROL_CHARACTERS_EXCEPT_NEWLINE_AND_TAB, ' ')
