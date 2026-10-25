import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'

import { converse } from '@services/bedrock'
import { log, logError } from '@utils/logging'

const mockSend = jest.fn()
jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn(() => ({
    send: (...args) => mockSend(...args),
  })),
  ConverseCommand: jest.fn().mockImplementation((x) => ({ input: x })),
}))
jest.mock('@utils/logging', () => ({
  log: jest.fn(),
  logError: jest.fn(),
  xrayCapture: jest.fn().mockImplementation((x) => x),
}))

describe('bedrock', () => {
  // Read before any test runs: the client is built once at import, and clearMocks empties the calls.
  const clientConfig = jest.mocked(BedrockRuntimeClient).mock.calls[0]?.[0]

  const command = new ConverseCommand({
    inferenceConfig: { maxTokens: 1024 },
    messages: [{ content: [{ text: 'Sensitive email body' }], role: 'user' }],
    modelId: 'us.anthropic.claude-haiku-test',
    system: [{ text: 'Sensitive system prompt' }],
  })
  const response = {
    output: { message: { content: [{ text: 'Sensitive model output' }], role: 'assistant' } },
    stopReason: 'tool_use',
    usage: { inputTokens: 321, outputTokens: 45, totalTokens: 366 },
  }

  beforeAll(() => {
    mockSend.mockResolvedValue(response)
  })

  describe('client', () => {
    test('expect a 20 second request timeout and at most two attempts', () => {
      expect(clientConfig).toEqual({ maxAttempts: 2, requestHandler: { requestTimeout: 20_000 } })
    })
  })

  describe('converse', () => {
    test('expect command sent and response returned', async () => {
      const result = await converse(command)

      expect(mockSend).toHaveBeenCalledWith(command)
      expect(result).toEqual(response)
    })

    test('expect model id and token usage logged, with no prompt or response text', async () => {
      await converse(command)

      expect(log).toHaveBeenCalledWith('Bedrock invocation complete', {
        inputTokens: 321,
        maxTokens: 1024,
        model: 'us.anthropic.claude-haiku-test',
        outputTokens: 45,
        stopReason: 'tool_use',
      })
      expect(logError).not.toHaveBeenCalled()
      expect(JSON.stringify(jest.mocked(log).mock.calls)).not.toContain('Sensitive')
    })

    test('expect logError when the generation stops on max_tokens', async () => {
      mockSend.mockResolvedValueOnce({ ...response, stopReason: 'max_tokens' })
      await converse(command)

      expect(logError).toHaveBeenCalledWith(
        'Bedrock invocation complete',
        expect.objectContaining({ stopReason: 'max_tokens' }),
      )
      expect(log).not.toHaveBeenCalled()
    })

    test('expect a response without usage still returned', async () => {
      mockSend.mockResolvedValueOnce({})
      const result = await converse(command)

      expect(result).toEqual({})
      expect(log).toHaveBeenCalledWith('Bedrock invocation complete', {
        inputTokens: undefined,
        maxTokens: 1024,
        model: 'us.anthropic.claude-haiku-test',
        outputTokens: undefined,
        stopReason: undefined,
      })
    })

    test('expect reject when send rejects', async () => {
      const error = new Error('AccessDeniedException')
      mockSend.mockRejectedValueOnce(error)

      await expect(converse(command)).rejects.toEqual(error)
      expect(log).not.toHaveBeenCalled()
    })
  })
})
