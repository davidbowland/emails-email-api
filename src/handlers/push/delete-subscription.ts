import { assertRequiredEnv } from '../../config'
import { getPushSubscriptionsById, setPushSubscriptionsById } from '../../services/dynamodb'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../../types'
import { validateUsernameInEvent } from '../../utils/events'
import { log, logError, redactEvent } from '../../utils/logging'
import status from '../../utils/status'

assertRequiredEnv('DYNAMODB_PUSH_SUBSCRIPTIONS_TABLE_NAME')

// Deleting an endpoint that is not stored is also NO_CONTENT: the caller's intent is satisfied
// either way, and a 404 would leak whether an endpoint is registered.
export const deleteSubscriptionHandler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', redactEvent(event))
  try {
    const accountId = event.pathParameters?.accountId as string
    if (!validateUsernameInEvent(event, accountId)) {
      return status.FORBIDDEN
    }

    const endpoint = event.queryStringParameters?.endpoint
    if (!endpoint) {
      return status.BAD_REQUEST
    }

    const existing = await getPushSubscriptionsById(accountId)
    await setPushSubscriptionsById(
      accountId,
      existing.filter((s) => s.endpoint !== endpoint),
    )
    return status.NO_CONTENT
  } catch (error) {
    logError(error)
    return status.INTERNAL_SERVER_ERROR
  }
}
