import { emailDomain } from '../../config'
import { getReceivedById, setReceivedById } from '../../services/dynamodb'
import { bounceEmail } from '../../services/queue'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Email } from '../../types'
import { validateUsernameInEvent } from '../../utils/events'
import { log, logError } from '../../utils/logging'
import status from '../../utils/status'

const determineBounceSender = (accountAddress: string, email: Email): string => {
  const recipients = email.to.concat(email.cc ?? []).concat(email.bcc ?? [])
  if (recipients.indexOf(accountAddress) >= 0) {
    return accountAddress
  }
  const domainEnding = `@${emailDomain}`
  const addressInDomain = recipients.find((address) => address.endsWith(domainEnding))
  return addressInDomain ?? accountAddress
}

const performBounce = async (
  accountId: string,
  emailId: string,
  email: Email,
): Promise<APIGatewayProxyResultV2<any>> => {
  try {
    if (email.bounced) {
      return status.BAD_REQUEST
    }

    const bounceSender = determineBounceSender(`${accountId}@${emailDomain}`, email)
    const { messageId } = await bounceEmail({
      bounceSender,
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
