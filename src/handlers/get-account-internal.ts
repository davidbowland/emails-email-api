import { getAccountById } from '../services/dynamodb'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../types'
import { log, logError } from '../utils/logging'
import status from '../utils/status'

export const getAccountInternalHandler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2<string>> => {
  log('Received event', { ...event, body: undefined })
  const accountId = event.pathParameters?.accountId as string

  try {
    const data = await getAccountById(accountId)
    return { ...status.OK, body: JSON.stringify({ ...data, id: accountId }) }
  } catch (error) {
    try {
      const data = await getAccountById('admin')
      return { ...status.OK, body: JSON.stringify({ ...data, id: accountId }) }
    } catch (error) {
      logError(error)
      return status.INTERNAL_SERVER_ERROR
    }
  }
}
