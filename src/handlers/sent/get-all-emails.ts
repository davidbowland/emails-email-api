import { getSent } from '../../services/dynamodb'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../../types'
import { validateUsernameInEvent } from '../../utils/events'
import { log, logError } from '../../utils/logging'
import status from '../../utils/status'

export const getAllEmailsHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', event)
  try {
    const accountId = event.pathParameters?.accountId as string
    if (!validateUsernameInEvent(event, accountId)) {
      return status.FORBIDDEN
    }

    const data = await getSent(accountId)
    return { ...status.OK, body: JSON.stringify(data) }
  } catch (error) {
    logError(error)
    return status.INTERNAL_SERVER_ERROR
  }
}
