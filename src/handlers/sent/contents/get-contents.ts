import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../../../types'
import { log, logError } from '../../../utils/logging'
import { getS3Object } from '../../../services/s3'
import { getSentById } from '../../../services/dynamodb'
import status from '../../../utils/status'
import { validateUsernameInEvent } from '../../../utils/events'

export const getContentsHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', { ...event, body: undefined })
  try {
    const accountId = event.pathParameters?.accountId as string
    const emailId = event.pathParameters?.emailId as string
    if (!validateUsernameInEvent(event, accountId)) {
      return status.FORBIDDEN
    }

    try {
      await getSentById(accountId, emailId)
      const { body } = await getS3Object(`sent/${accountId}/${emailId}`)
      return {
        ...status.OK,
        body: body.toString('utf-8'),
      }
    } catch (error) {
      return status.NOT_FOUND
    }
  } catch (error) {
    logError(error)
    return status.INTERNAL_SERVER_ERROR
  }
}
