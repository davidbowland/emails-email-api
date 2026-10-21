import { getAccountById, setAccountById } from '../services/dynamodb'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, SpamFilter } from '../types'
import { extractAccountFromEvent, validateUsernameInEvent } from '../utils/events'
import { log, logError, redactEvent } from '../utils/logging'
import status from '../utils/status'

// A PUT that carries no spamFilter (a client that predates the field) keeps the stored rules rather
// than resetting them. A new account has nothing stored, so the default applies.
const getStoredSpamFilter = async (accountId: string): Promise<SpamFilter | undefined> => {
  try {
    return (await getAccountById(accountId)).spamFilter
  } catch {
    return undefined
  }
}

export const putAccountHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', redactEvent(event))
  try {
    const accountId = event.pathParameters?.accountId as string
    if (!validateUsernameInEvent(event, accountId)) {
      return status.FORBIDDEN
    }

    const account = extractAccountFromEvent(event, await getStoredSpamFilter(accountId))
    try {
      await setAccountById(accountId, account)
      return { ...status.OK, body: JSON.stringify(account) }
    } catch (error) {
      logError(error)
      return status.INTERNAL_SERVER_ERROR
    }
  } catch (error: unknown) {
    return { ...status.BAD_REQUEST, body: JSON.stringify({ message: (error as any).message }) }
  }
}
