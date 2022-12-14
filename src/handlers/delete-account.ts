import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../types'
import { deleteAccountById, getAccountById } from '../services/dynamodb'
import { log, logError } from '../utils/logging'
import status from '../utils/status'
import { validateUsernameInEvent } from '../utils/events'

export const deleteAccountHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', { ...event, body: undefined })
  const accountId = event.pathParameters?.accountId as string
  if (!validateUsernameInEvent(event, accountId)) {
    return status.FORBIDDEN
  }

  try {
    const data = await getAccountById(accountId)
    try {
      await deleteAccountById(accountId)
      return { ...status.OK, body: JSON.stringify(data) }
    } catch (error) {
      logError(error)
      return status.INTERNAL_SERVER_ERROR
    }
  } catch (error) {
    return status.NO_CONTENT
  }
}
