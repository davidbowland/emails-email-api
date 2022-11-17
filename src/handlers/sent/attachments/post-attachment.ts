import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../../../types'
import { extractUsernameFromEvent } from '../../../utils/events'
import { log } from '../../../utils/logging'
import status from '../../../utils/status'
import { uploadS3Object } from '../../../services/s3'
import { v4 as uuidv4 } from 'uuid'

export const postAttachmentHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', { ...event, body: undefined })
  try {
    const accountId = event.pathParameters?.accountId as string
    if (accountId !== extractUsernameFromEvent(event)) {
      return status.FORBIDDEN
    }

    const key = `attachments/${accountId}/${uuidv4()}`
    const presignedPost = await uploadS3Object(key)
    return {
      ...status.CREATED,
      body: JSON.stringify(presignedPost),
    }
  } catch (error) {
    log(error)
    return status.INTERNAL_SERVER_ERROR
  }
}
