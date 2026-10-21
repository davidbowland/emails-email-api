import {
  assertRequiredEnv,
  bedrockModelId,
  DEFAULT_SPAM_FILTER,
  spamSuggestionDailyLimit,
  spamSuggestionUsageTableName,
} from '@config'

jest.mock('axios')
jest.mock('axios-retry')

describe('config', () => {
  describe('assertRequiredEnv', () => {
    it('should not throw when every variable is set', () => {
      expect(() => assertRequiredEnv('EMAIL_DOMAIN', 'QUEUE_API_URL')).not.toThrow()
    })

    it('should throw naming every missing variable', () => {
      expect(() => assertRequiredEnv('QUEUE_API_URL', 'NOT_SET_ONE', 'NOT_SET_TWO')).toThrow(
        'Missing required environment variable(s): NOT_SET_ONE, NOT_SET_TWO. ' +
          "Add them to this function's Environment.Variables in template.yaml.",
      )
    })
  })

  describe('DEFAULT_SPAM_FILTER', () => {
    it('should default to medium sensitivity with no rules', () => {
      expect(DEFAULT_SPAM_FILTER).toEqual({ blockPhrases: [], sensitivity: 'medium', trustedSenders: [] })
    })
  })

  describe('bedrockModelId', () => {
    it('should read BEDROCK_MODEL_ID', () => {
      expect(bedrockModelId).toEqual('us.anthropic.claude-haiku-test')
    })
  })

  describe('spamSuggestionDailyLimit', () => {
    it('should parse SPAM_SUGGESTION_DAILY_LIMIT as a number', () => {
      expect(spamSuggestionDailyLimit).toBe(20)
    })
  })

  describe('spamSuggestionUsageTableName', () => {
    it('should read SPAM_SUGGESTION_USAGE_TABLE_NAME', () => {
      expect(spamSuggestionUsageTableName).toEqual('spam-suggestion-usage-table')
    })
  })
})
