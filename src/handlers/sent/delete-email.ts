import { deleteSentById, getSentById } from '../../services/dynamodb'
import { deleteS3Object } from '../../services/s3'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../../types'
import { validateUsernameInEvent } from '../../utils/events'
import { log, logError } from '../../utils/logging'
import status from '../../utils/status'

const deleteEmail = async (accountId: string, emailId: string) => {
  try {
    const data = await getSentById(accountId, emailId)
    try {
      await deleteSentById(accountId, emailId)
      try {
        await Promise.all(
          data.attachments?.map((attachment) => deleteS3Object(`sent/${accountId}/${emailId}/${attachment.id}`)) ?? [],
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

export const deleteEmailHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<string>> => {
  log('Received event', { ...event, body: undefined })
  try {
    const accountId = event.pathParameters?.accountId as string
    const emailId = event.pathParameters?.emailId as string
    if (!validateUsernameInEvent(event, accountId)) {
      return status.FORBIDDEN
    }

    return await deleteEmail(accountId, emailId)
  } catch (error) {
    logError(error)
    return status.INTERNAL_SERVER_ERROR
  }
}
