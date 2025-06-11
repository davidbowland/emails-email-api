import { getReceivedById } from '../../../services/dynamodb'
import { getSignedS3Url } from '../../../services/s3'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../../../types'
import { validateUsernameInEvent } from '../../../utils/events'
import { log } from '../../../utils/logging'
import status from '../../../utils/status'

export const getAttachmentHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', { ...event, body: undefined })
  try {
    const accountId = event.pathParameters?.accountId as string
    const attachmentId = event.pathParameters?.attachmentId as string
    const emailId = event.pathParameters?.emailId as string
    if (!validateUsernameInEvent(event, accountId)) {
      return status.FORBIDDEN
    }

    try {
      await getReceivedById(accountId, emailId)
      try {
        const url = await getSignedS3Url(`received/${accountId}/${emailId}/${attachmentId}`)
        return {
          ...status.OK,
          body: JSON.stringify({ url }),
        }
      } catch (error) {
        log(error)
        return status.INTERNAL_SERVER_ERROR
      }
    } catch (error) {
      return status.NOT_FOUND
    }
  } catch (error) {
    log(error)
    return status.INTERNAL_SERVER_ERROR
  }
}
