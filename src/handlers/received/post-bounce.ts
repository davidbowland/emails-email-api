import { getReceivedById, setReceivedById } from '../../services/dynamodb'
import { bounceEmail } from '../../services/queue'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Email } from '../../types'
import { validateUsernameInEvent } from '../../utils/events'
import { log, logError } from '../../utils/logging'
import status from '../../utils/status'

const performBounce = async (
  accountId: string,
  emailId: string,
  email: Email,
): Promise<APIGatewayProxyResultV2<any>> => {
  try {
    if (email.bounced) {
      return status.BAD_REQUEST
    }

    const lowercaseAccountId = accountId.toLowerCase()
    const { messageId } = await bounceEmail({
      bounceSender: email.to.find((to) => to.toLowerCase().startsWith(`${lowercaseAccountId}@`)) as string,
      messageId: emailId,
      recipients: email.to,
    })

    const updatedEmail = { ...email, bounced: true }
    await setReceivedById(accountId, emailId, updatedEmail)

    return { ...status.OK, body: JSON.stringify({ messageId }) }
  } catch (error) {
    logError(error)
    return status.INTERNAL_SERVER_ERROR
  }
}

export const bounceEmailHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', { ...event, body: undefined })
  try {
    const accountId = event.pathParameters?.accountId as string
    const emailId = event.pathParameters?.emailId as string
    if (!validateUsernameInEvent(event, accountId)) {
      return status.FORBIDDEN
    }

    try {
      const email = await getReceivedById(accountId, emailId)
      return await performBounce(accountId, emailId, email)
    } catch (error) {
      return status.NOT_FOUND
    }
  } catch (error) {
    logError(error)
    return status.INTERNAL_SERVER_ERROR
  }
}
