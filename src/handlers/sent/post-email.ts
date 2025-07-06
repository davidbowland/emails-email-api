import { emailDomain } from '../../config'
import { getAccountById, setSentById } from '../../services/dynamodb'
import { sendEmail } from '../../services/queue'
import { copyS3Object, putS3Object } from '../../services/s3'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../../types'
import {
  convertOutboundToContents,
  convertOutboundToEmail,
  extractEmailOutboundFromEvent,
  validateUsernameInEvent,
} from '../../utils/events'
import { log, logError } from '../../utils/logging'
import status from '../../utils/status'

export const postEmailHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<string>> => {
  log('Received event', { ...event, body: undefined })
  try {
    const accountId = event.pathParameters?.accountId as string
    try {
      if (!validateUsernameInEvent(event, accountId)) {
        return status.FORBIDDEN
      }
    } catch (error) {
      logError(error)
      return status.INTERNAL_SERVER_ERROR
    }

    const account = await getAccountById(accountId)
    const from = { address: `${accountId}@${emailDomain}`, name: account.name }
    try {
      const outboundEmail = extractEmailOutboundFromEvent(event, from)
      try {
        const { messageId } = await sendEmail(outboundEmail)
        const email = convertOutboundToEmail(outboundEmail)
        const contents = convertOutboundToContents(messageId, outboundEmail, email.timestamp)
        await putS3Object(`sent/${accountId}/${messageId}`, JSON.stringify(contents))
        for (const attachment of contents.attachments ?? []) {
          await copyS3Object(
            `attachments/${accountId}/${attachment.id}`,
            `sent/${accountId}/${messageId}/${attachment.id}`,
          )
        }
        await setSentById(accountId, messageId, email)
        return { ...status.OK, body: JSON.stringify({ ...email, accountId, id: messageId }) }
      } catch (error) {
        logError(error)
        return status.INTERNAL_SERVER_ERROR
      }
    } catch (error: unknown) {
      return { ...status.BAD_REQUEST, body: JSON.stringify({ message: (error as any).message }) }
    }
  } catch (error) {
    return status.NOT_FOUND
  }
}
