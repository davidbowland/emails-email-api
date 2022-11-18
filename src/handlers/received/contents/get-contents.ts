import { simpleParser } from 'mailparser'

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../../../types'
import { log, logError } from '../../../utils/logging'
import { convertParsedContentsToEmail } from '../../../utils/parser'
import { getReceivedById } from '../../../services/dynamodb'
import { getS3Object } from '../../../services/s3'
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
      await getReceivedById(accountId, emailId)
      const { body } = await getS3Object(`received/${accountId}/${emailId}`)
      try {
        const parsedMail = await simpleParser(body)
        return {
          ...status.OK,
          body: JSON.stringify(convertParsedContentsToEmail(emailId, parsedMail)),
        }
      } catch (error) {
        logError(error)
        return status.INTERNAL_SERVER_ERROR
      }
    } catch (error) {
      return status.NOT_FOUND
    }
  } catch (error) {
    logError(error)
    return status.INTERNAL_SERVER_ERROR
  }
}
