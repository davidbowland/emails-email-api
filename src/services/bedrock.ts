import { BedrockRuntimeClient, ConverseCommand, ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime'

import { log, logError, xrayCapture } from '../utils/logging'

// The UI waits on this call, so a slow model fails fast instead of holding the Lambda to its own timeout:
// each attempt is cut off after 20 seconds (the SDK then rejects with a TimeoutError, answered 503), and a
// failed attempt is retried once at most.
const REQUEST_TIMEOUT_MS = 20_000
const MAX_ATTEMPTS = 2

const bedrock = xrayCapture(
  new BedrockRuntimeClient({ maxAttempts: MAX_ATTEMPTS, requestHandler: { requestTimeout: REQUEST_TIMEOUT_MS } }),
)

// Logs the model id and token counts only -- never the prompt, the tool input or any text the model
// returned, because every one of those carries email content (AC-027).
//
// Converse reports usage as `usage.inputTokens` / `usage.outputTokens`; there is no thinking-token
// count, and no thinking is requested here.
//
// Every field is optional-chained, including the root hops. This runs after the model has already
// been called and paid for, so a response that omits a field must cost this line a field, never turn a
// successful invocation into a failure.
//
// ERROR only on a truncated generation: every log group here is subscribed on level="ERROR", which
// pages a human, so a healthy tool_use stop must stay at `log`.
const logModelUsage = (command: ConverseCommand, response: ConverseCommandOutput): void => {
  const write = response?.stopReason === 'max_tokens' ? logError : log
  write('Bedrock invocation complete', {
    inputTokens: response?.usage?.inputTokens,
    maxTokens: command?.input?.inferenceConfig?.maxTokens,
    model: command?.input?.modelId,
    outputTokens: response?.usage?.outputTokens,
    stopReason: response?.stopReason,
  })
}

// Usage logging lives at the client boundary so no caller can reach Bedrock without it.
export const converse = async (command: ConverseCommand): Promise<ConverseCommandOutput> => {
  const response = await bedrock.send(command)
  logModelUsage(command, response)
  return response
}
