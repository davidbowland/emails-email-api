import { getReceived } from '../../services/dynamodb'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, EmailBatch, EmailFolder } from '../../types'
import { canEmailBeBounced } from '../../utils/email'
import { validateUsernameInEvent } from '../../utils/events'
import { log, logError, redactEvent } from '../../utils/logging'
import status from '../../utils/status'

const EMAIL_FOLDERS: EmailFolder[] = ['inbox', 'spam']

// Emails stored before the spam filter carry no folder; they belong to the Inbox.
const isInFolder =
  (folder: EmailFolder) =>
  (emailBatch: EmailBatch): boolean =>
    (emailBatch.data.folder ?? 'inbox') === folder

export const getAllEmailsHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', redactEvent(event))
  try {
    const accountId = event.pathParameters?.accountId as string
    if (!validateUsernameInEvent(event, accountId)) {
      return status.FORBIDDEN
    }

    const folder = (event.queryStringParameters?.folder ?? 'inbox') as EmailFolder
    if (!EMAIL_FOLDERS.includes(folder)) {
      return {
        ...status.BAD_REQUEST,
        body: JSON.stringify({ message: `folder must be one of ${EMAIL_FOLDERS.join(', ')}` }),
      }
    }

    const data = await getReceived(accountId)
    const dataWithCanBeBounced = data.filter(isInFolder(folder)).map((emailBatch) => ({
      ...emailBatch,
      data: {
        ...emailBatch.data,
        canBeBounced: canEmailBeBounced(emailBatch.data),
      },
    }))
    return { ...status.OK, body: JSON.stringify(dataWithCanBeBounced) }
  } catch (error) {
    logError(error)
    return status.INTERNAL_SERVER_ERROR
  }
}
