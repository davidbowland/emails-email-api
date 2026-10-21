import { applyPatch } from 'fast-json-patch'

import { mutateObjectOnJsonPatch, throwOnInvalidJsonPatch } from '../config'
import { getAccountById, setAccountById } from '../services/dynamodb'
import { Account, APIGatewayProxyEventV2, APIGatewayProxyResultV2, PatchOperation } from '../types'
import { extractJsonPatchFromEvent, formatAccount, validateUsernameInEvent } from '../utils/events'
import { log, logError, redactEvent } from '../utils/logging'
import status from '../utils/status'

// Only these paths may be patched. spamFilter is allowed as a whole or by member, because every
// result is validated as a whole by formatAccount before anything is stored.
const isAllowedPatchPath = (path: string): boolean =>
  path.startsWith('/forwardTargets/') ||
  path.startsWith('/bounceSenders/') ||
  path === '/name' ||
  path === '/spamFilter' ||
  path.startsWith('/spamFilter/')

// move and copy read from a `from` path that the path check above never sees, so they could carry
// any field of the account into an allowed one. Neither is needed by any client.
const DISALLOWED_PATCH_OPS = ['move', 'copy']

const isAllowedPatchOperation = (operation: PatchOperation): boolean =>
  !DISALLOWED_PATCH_OPS.includes(operation.op) && isAllowedPatchPath(operation.path)

const applyJsonPatch = async (
  account: Account,
  accountId: string,
  patchOperations: PatchOperation[],
): Promise<APIGatewayProxyResultV2<any>> => {
  // Validate the post-patch account: validating before the patch would let any patch store values
  // formatAccount has never seen.
  const updatedAccount = formatAccount(
    applyPatch(account, patchOperations, throwOnInvalidJsonPatch, mutateObjectOnJsonPatch).newDocument,
  )
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
): Promise<APIGatewayProxyResultV2<any>> => {
  try {
    const account = await getAccountById(accountId)
    try {
      return await applyJsonPatch(account, accountId, patchOperations)
    } catch (error: unknown) {
      return { ...status.BAD_REQUEST, body: JSON.stringify({ message: (error as any).message }) }
    }
  } catch {
    return status.NOT_FOUND
  }
}

export const patchAccountHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', redactEvent(event))
  try {
    const accountId = event.pathParameters?.accountId as string
    if (!validateUsernameInEvent(event, accountId)) {
      return status.FORBIDDEN
    }

    const patchOperations = extractJsonPatchFromEvent(event)
    if (!patchOperations.every(isAllowedPatchOperation)) {
      return status.FORBIDDEN
    }
    const result = await patchById(accountId, patchOperations)
    return result
  } catch (error: unknown) {
    return { ...status.BAD_REQUEST, body: JSON.stringify({ message: (error as any).message }) }
  }
}
