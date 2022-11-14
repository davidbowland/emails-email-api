import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../../types'
import { deleteSentById, getSentById } from '../../services/dynamodb'
import { log, logError } from '../../utils/logging'
import { deleteS3Object } from '../../services/s3'
import { extractUsernameFromEvent } from '../../utils/events'
import status from '../../utils/status'

const deleteEmail = async (accountId: string, emailId: string) => {
  try {
    const data = await getSentById(accountId, emailId)
    try {
      await deleteSentById(accountId, emailId)
      try {
        await Promise.all(
          data.attachments?.map((attachment) => deleteS3Object(`sent/${accountId}/${emailId}/${attachment.id}`)) ?? []
        )
      } catch (error) {
        log('Error deleting attachments', { accountId, emailId, error })
      }
      try {
        await deleteS3Object(`sent/${accountId}/${emailId}`)
      } catch (error) {
        log('Error deleting email', { accountId, emailId, error })
      }
      return { ...status.OK, body: JSON.stringify({ ...data, accountId, id: emailId }) }
    } catch (error) {
      logError(error)
      return status.INTERNAL_SERVER_ERROR
    }
  } catch (error) {
    return status.NOT_FOUND
  }
}

export const deleteEmailHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', { ...event, body: undefined })
  try {
    const accountId = event.pathParameters?.accountId as string
    const emailId = event.pathParameters?.emailId as string
    if (accountId !== extractUsernameFromEvent(event)) {
      return status.FORBIDDEN
    }

    return await deleteEmail(accountId, emailId)
  } catch (error) {
    logError(error)
    return status.INTERNAL_SERVER_ERROR
  }
}
