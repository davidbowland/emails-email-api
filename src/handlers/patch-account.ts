import { applyPatch } from 'fast-json-patch'

import { mutateObjectOnJsonPatch, throwOnInvalidJsonPatch } from '../config'
import { getAccountById, setAccountById } from '../services/dynamodb'
import { Account, APIGatewayProxyEventV2, APIGatewayProxyResultV2, PatchOperation } from '../types'
import { extractJsonPatchFromEvent, formatAccount, validateUsernameInEvent } from '../utils/events'
import { log, logError } from '../utils/logging'
import status from '../utils/status'

const applyJsonPatch = async (
  account: Account,
  accountId: string,
  patchOperations: PatchOperation[],
): Promise<APIGatewayProxyResultV2<string>> => {
  const updatedAccount = applyPatch(
    account,
    patchOperations,
    throwOnInvalidJsonPatch,
    mutateObjectOnJsonPatch,
  ).newDocument
  try {
    await setAccountById(accountId, updatedAccount)
    return { ...status.OK, body: JSON.stringify(updatedAccount) }
  } catch (error) {
    logError(error)
    return status.INTERNAL_SERVER_ERROR
  }
}

const patchById = async (
  accountId: string,
  patchOperations: PatchOperation[],
): Promise<APIGatewayProxyResultV2<string>> => {
  try {
    const account = await getAccountById(accountId)
    try {
      const formattedAccount = formatAccount(account)
      return await applyJsonPatch(formattedAccount, accountId, patchOperations)
    } catch (error: unknown) {
      return { ...status.BAD_REQUEST, body: JSON.stringify({ message: (error as any).message }) }
    }
  } catch {
    return status.NOT_FOUND
  }
}

export const patchAccountHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', { ...event, body: undefined })
  try {
    const accountId = event.pathParameters?.accountId as string
    if (!validateUsernameInEvent(event, accountId)) {
      return status.FORBIDDEN
    }

    const patchOperations = extractJsonPatchFromEvent(event)
    if (
      !patchOperations.every(
        (value) =>
          value.path.startsWith('/forwardTargets/') ||
          value.path.startsWith('/bounceSenders/') ||
          value.path === '/name',
      )
    ) {
      return status.FORBIDDEN
    }
    const result = await patchById(accountId, patchOperations)
    return result
  } catch (error: unknown) {
    return { ...status.BAD_REQUEST, body: JSON.stringify({ message: (error as any).message }) }
  }
}
