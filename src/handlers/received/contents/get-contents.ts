import { simpleParser } from 'mailparser'

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../../../types'
import { log, logError } from '../../../utils/logging'
import { convertParsedContentsToEmail } from '../../../utils/parser'
import { extractUsernameFromEvent } from '../../../utils/events'
import { getReceivedById } from '../../../services/dynamodb'
import { getS3Object } from '../../../services/s3'
import status from '../../../utils/status'

export const getContentsHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', { ...event, body: undefined })
  try {
    const accountId = event.pathParameters?.accountId as string
    const emailId = event.pathParameters?.emailId as string
    if (accountId !== extractUsernameFromEvent(event)) {
      return status.FORBIDDEN
    }

    try {
      await getReceivedById(accountId, emailId)
    } catch (error) {
      return status.NOT_FOUND
    }

    const { body } = await getS3Object(`received/${accountId}/${emailId}`)
    const parsedMail = await simpleParser(body)
    return {
      ...status.OK,
      body: JSON.stringify(convertParsedContentsToEmail(emailId, parsedMail)),
    }
  } catch (error) {
    logError(error)
    return status.INTERNAL_SERVER_ERROR
  }
}
