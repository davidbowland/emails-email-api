import vectors from '../spam-body-vectors.json'
import { matchesSenderRule } from '@utils/sender-rules'

describe('sender-rules', () => {
  describe('matchesSenderRule', () => {
    it.each(vectors.senderRules)('vector: $note', ({ address, expected, rule }) => {
      expect(matchesSenderRule(address, rule)).toEqual(expected)
    })
  })
})
