import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../../../types'
import { getReceivedById } from '../../../services/dynamodb'
import { getS3Object } from '../../../services/s3'
import { log } from '../../../utils/logging'
import status from '../../../utils/status'
import { validateUsernameInEvent } from '../../../utils/events'

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
      const { body, metadata } = await getS3Object(`received/${accountId}/${emailId}/${attachmentId}`)
      try {
        return {
          ...status.OK,
          body: body.toString('base64'),
          headers: {
            'Content-Disposition': `attachment; filename="${metadata['filename'].replace(/[^\w\\.]+/g, '_')}"`,
            'Content-Length': metadata['size'].replace(/\D+/g, ''),
            'Content-Type': metadata['contenttype'].replace(/[^\w\\.\\/-]+/g, ''),
          },
          isBase64Encoded: true,
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
