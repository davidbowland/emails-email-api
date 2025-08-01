import { simpleParser } from 'mailparser'

import { getReceivedById } from '../../../services/dynamodb'
import { getS3Object } from '../../../services/s3'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../../../types'
import { validateUsernameInEvent } from '../../../utils/events'
import { log, logError } from '../../../utils/logging'
import { convertParsedContentsToEmail } from '../../../utils/parser'
import status from '../../../utils/status'

export const getContentsHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<string>> => {
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
