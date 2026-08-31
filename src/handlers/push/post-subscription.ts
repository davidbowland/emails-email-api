import { assertRequiredEnv } from '../../config'
import { getPushSubscriptionsById, setPushSubscriptionsById } from '../../services/dynamodb'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../../types'
import { extractPushSubscriptionFromEvent, validateUsernameInEvent } from '../../utils/events'
import { log, logError, redactEvent } from '../../utils/logging'
import status from '../../utils/status'

assertRequiredEnv('DYNAMODB_PUSH_SUBSCRIPTIONS_TABLE_NAME')

export const postSubscriptionHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', redactEvent(event))
  // The access decision sits outside the try below, which answers any throw with a 400 carrying that
  // error's message. Same shape as get-account.ts. An access check must not be reported to the
  // caller as a malformed body, and nothing about how it failed belongs in the response.
  const accountId = event.pathParameters?.accountId as string
  if (!validateUsernameInEvent(event, accountId)) {
    return status.FORBIDDEN
  }

  try {
    const subscription = extractPushSubscriptionFromEvent(event)
    try {
      const existing = await getPushSubscriptionsById(accountId)
      const next = [...existing.filter((s) => s.endpoint !== subscription.endpoint), subscription]
      await setPushSubscriptionsById(accountId, next)
      return status.NO_CONTENT
    } catch (error) {
      logError(error)
      return status.INTERNAL_SERVER_ERROR
    }
  } catch (error: unknown) {
    return { ...status.BAD_REQUEST, body: JSON.stringify({ message: (error as any).message }) }
  }
}
