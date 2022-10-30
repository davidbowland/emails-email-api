import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../../types'
import { getAccountById, setReceivedById } from '../../services/dynamodb'
import { log, logError } from '../../utils/logging'
import { extractEmailFromEvent } from '../../utils/events'
import status from '../../utils/status'

export const putEmailHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', { ...event, body: undefined })
  try {
    const accountId = event.pathParameters?.accountId as string
    const emailId = event.pathParameters?.emailId as string
    const email = extractEmailFromEvent(event)
    try {
      await setReceivedById(accountId, emailId, email)
      try {
        await getAccountById(accountId)
      } catch (error) {
        await setReceivedById('admin', emailId, email)
      }
      return { ...status.OK, body: JSON.stringify(email) }
    } catch (error) {
      logError(error)
      return status.INTERNAL_SERVER_ERROR
    }
  } catch (error: any) {
    return { ...status.BAD_REQUEST, body: JSON.stringify({ message: error.message }) }
  }
}
