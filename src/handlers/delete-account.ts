import { assertRequiredEnv } from '../config'
import { deleteAccountById, deletePushSubscriptionsById, getAccountById } from '../services/dynamodb'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../types'
import { validateUsernameInEvent } from '../utils/events'
import { log, logError, redactEvent } from '../utils/logging'
import status from '../utils/status'

assertRequiredEnv('DYNAMODB_ACCOUNTS_TABLE_NAME', 'DYNAMODB_PUSH_SUBSCRIPTIONS_TABLE_NAME')

export const deleteAccountHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', redactEvent(event))
  const accountId = event.pathParameters?.accountId as string
  if (!validateUsernameInEvent(event, accountId)) {
    return status.FORBIDDEN
  }

  try {
    const data = await getAccountById(accountId)
    try {
      // The subscriptions go first, and deliberately so. Nothing else will ever prune them: the only
      // prune runs from the notify handler, which needs an account that no longer exists. Deleting
      // them after the account would leave a retry with nothing to find, because the second call
      // takes the NO_CONTENT path below and the push endpoints -- sendable capabilities, not opaque
      // ids -- would sit in DynamoDB forever, contradicting the privacy policy's promise that they
      // are kept only "until you turn notifications off". This order makes a failed delete safely
      // repeatable: the account survives, the caller gets a 500, and a retry finishes the job.
      await deletePushSubscriptionsById(accountId)
      await deleteAccountById(accountId)
      return { ...status.OK, body: JSON.stringify(data) }
    } catch (error) {
      logError(error)
      return status.INTERNAL_SERVER_ERROR
    }
  } catch {
    return status.NO_CONTENT
  }
}
