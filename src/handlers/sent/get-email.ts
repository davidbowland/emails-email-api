import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../../types'
import { log, logError } from '../../utils/logging'
import { extractUsernameFromEvent } from '../../utils/events'
import { getSentById } from '../../services/dynamodb'
import status from '../../utils/status'

export const getEmailHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', { ...event, body: undefined })
  try {
    const accountId = event.pathParameters?.accountId as string
    const emailId = event.pathParameters?.emailId as string
    if (accountId !== extractUsernameFromEvent(event)) {
      return status.FORBIDDEN
    }

    try {
      const data = await getSentById(accountId, emailId)
      return { ...status.OK, body: JSON.stringify({ ...data, accountId, id: emailId }) }
    } catch (error) {
      return status.NOT_FOUND
    }
  } catch (error) {
    logError(error)
    return status.INTERNAL_SERVER_ERROR
  }
}
