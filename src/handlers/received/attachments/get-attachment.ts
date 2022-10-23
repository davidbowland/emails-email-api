import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../../../types'
import { extractUsernameFromEvent } from '../../../utils/events'
import { getReceivedById } from '../../../services/dynamodb'
import { getS3Object } from '../../../services/s3'
import { log } from '../../../utils/logging'
import status from '../../../utils/status'

export const getAttachmentHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', { ...event, body: undefined })
  try {
    const accountId = event.pathParameters?.accountId as string
    const attachmentId = event.pathParameters?.attachmentId as string
    const emailId = event.pathParameters?.emailId as string
    if (accountId !== extractUsernameFromEvent(event)) {
      return status.FORBIDDEN
    }

    try {
      await getReceivedById(accountId, emailId)
    } catch (error) {
      return status.NOT_FOUND
    }

    const { body, metadata } = await getS3Object(`/inbound/${emailId}/${attachmentId}`)
    return {
      ...status.OK,
      body: body.toString('base64'),
      headers: {
        'Content-Disposition': `attachment; filename="${metadata['x-amz-meta-filename'].replace(/[^\w\\.]+/g, '_')}"`,
        'Content-Length': metadata['x-amz-meta-size'].replace(/\D+/g, ''),
        'Content-Type': metadata['x-amz-meta-contenttype'].replace(/[^\w\\.\\/-]+/g, ''),
      },
      isBase64Encoded: true,
    }
  } catch (error) {
    return status.INTERNAL_SERVER_ERROR
  }
}