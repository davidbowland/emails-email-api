import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../types'
import { extractAccountFromEvent, extractUsernameFromEvent } from '../utils/events'
import { log, logError } from '../utils/logging'
import { setAccountById } from '../services/dynamodb'
import status from '../utils/status'

export const putAccountHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', { ...event, body: undefined })
  try {
    const accountId = event.pathParameters?.accountId as string
    if (accountId !== extractUsernameFromEvent(event)) {
      return status.FORBIDDEN
    }

    const account = extractAccountFromEvent(event)
    try {
      await setAccountById(accountId, account)
      return { ...status.OK, body: JSON.stringify(account) }
    } catch (error) {
      logError(error)
      return status.INTERNAL_SERVER_ERROR
    }
  } catch (error: any) {
    return { ...status.BAD_REQUEST, body: JSON.stringify({ message: error.message }) }
  }
}
