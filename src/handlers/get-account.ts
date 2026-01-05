import { getAccountById } from '../services/dynamodb'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../types'
import { validateUsernameInEvent } from '../utils/events'
import { log } from '../utils/logging'
import status from '../utils/status'

export const getAccountHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', { ...event, body: undefined })
  const accountId = event.pathParameters?.accountId as string
  if (!validateUsernameInEvent(event, accountId)) {
    return status.FORBIDDEN
  }

  try {
    const data = await getAccountById(accountId)
    return { ...status.OK, body: JSON.stringify({ ...data, id: accountId }) }
  } catch (error) {
    return status.NOT_FOUND
  }
}
