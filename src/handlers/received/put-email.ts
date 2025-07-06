import { setReceivedById } from '../../services/dynamodb'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../../types'
import { extractEmailFromEvent } from '../../utils/events'
import { log, logError } from '../../utils/logging'
import status from '../../utils/status'

export const putEmailHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<string>> => {
  log('Received event', { ...event, body: undefined })
  try {
    const accountId = event.pathParameters?.accountId as string
    const emailId = event.pathParameters?.emailId as string
    const email = extractEmailFromEvent(event)
    try {
      await setReceivedById(accountId, emailId, email)
      return { ...status.OK, body: JSON.stringify(email) }
    } catch (error) {
      logError(error)
      return status.INTERNAL_SERVER_ERROR
    }
  } catch (error: unknown) {
    return { ...status.BAD_REQUEST, body: JSON.stringify({ message: (error as any).message }) }
  }
}
