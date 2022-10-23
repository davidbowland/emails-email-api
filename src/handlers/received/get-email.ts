import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../../types'
import { extractUsernameFromEvent } from '../../utils/events'
import { getReceivedById } from '../../services/dynamodb'
import { log } from '../../utils/logging'
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
      const data = await getReceivedById(accountId, emailId)
      return { ...status.OK, body: JSON.stringify({ ...data, accountId, id: emailId }) }
    } catch (error) {
      return status.NOT_FOUND
    }
  } catch (error) {
    return status.INTERNAL_SERVER_ERROR
  }
}