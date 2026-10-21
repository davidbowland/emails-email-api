import { getAccountById, setAccountById } from '../services/dynamodb'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, SpamFilter } from '../types'
import { extractAccountFromEvent, validateUsernameInEvent } from '../utils/events'
import { log, logError, redactEvent } from '../utils/logging'
import status from '../utils/status'

// A PUT that carries no spamFilter (a client that predates the field) keeps the stored rules rather
// than resetting them. A new account has nothing stored, so the default applies -- but only on
// getAccountById's 'Account not found' sentinel. Any other read failure rethrows: treating a DynamoDB
// fault as "nothing stored" would overwrite the owner's rules with the default.
const getStoredSpamFilter = async (accountId: string): Promise<SpamFilter | undefined> => {
  try {
    return (await getAccountById(accountId)).spamFilter
  } catch (error) {
    if ((error as Error)?.message !== 'Account not found') {
      throw error
    }
    return undefined
  }
}

const putById = async (
  event: APIGatewayProxyEventV2,
  accountId: string,
  storedSpamFilter: SpamFilter | undefined,
): Promise<APIGatewayProxyResultV2<any>> => {
  try {
    const account = extractAccountFromEvent(event, storedSpamFilter)
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

export const putAccountHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', redactEvent(event))
  try {
    const accountId = event.pathParameters?.accountId as string
    if (!validateUsernameInEvent(event, accountId)) {
      return status.FORBIDDEN
    }

    return await putById(event, accountId, await getStoredSpamFilter(accountId))
  } catch (error) {
    // Only a stored-account read failure reaches here; a bad body is a 400 inside putById.
    logError(error)
    return status.INTERNAL_SERVER_ERROR
  }
}
