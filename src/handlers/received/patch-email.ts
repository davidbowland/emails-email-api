import { applyPatch } from 'fast-json-patch'

import { mutateObjectOnJsonPatch, throwOnInvalidJsonPatch } from '../../config'
import { getReceivedById, setReceivedById } from '../../services/dynamodb'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Email, EmailFolder, PatchOperation } from '../../types'
import { extractJsonPatchFromEvent, validateUsernameInEvent } from '../../utils/events'
import { log, logError, redactEvent } from '../../utils/logging'
import status from '../../utils/status'

const EMAIL_FOLDERS: EmailFolder[] = ['inbox', 'spam']

// /folder is a move between Inbox and Spam: only `replace`, so a patch cannot remove the field.
// move and copy are refused everywhere because they read a `from` path this check never sees.
const isAllowedPatchOperation = (operation: PatchOperation): boolean =>
  (operation.path === '/viewed' && operation.op !== 'move' && operation.op !== 'copy') ||
  (operation.path === '/folder' && operation.op === 'replace')

const isValidPatchValue = (operation: PatchOperation): boolean =>
  operation.path !== '/folder' || EMAIL_FOLDERS.includes((operation as { value?: EmailFolder }).value as EmailFolder)

const applyJsonPatch = async (
  email: Email,
  accountId: string,
  emailId: string,
  patchOperations: PatchOperation[],
): Promise<APIGatewayProxyResultV2<any>> => {
  const updatedEmail = applyPatch(email, patchOperations, throwOnInvalidJsonPatch, mutateObjectOnJsonPatch).newDocument
  try {
    await setReceivedById(accountId, emailId, updatedEmail)
    return { ...status.OK, body: JSON.stringify(updatedEmail) }
  } catch (error) {
    logError(error)
    return status.INTERNAL_SERVER_ERROR
  }
}

const patchById = async (
  accountId: string,
  emailId: string,
  patchOperations: PatchOperation[],
): Promise<APIGatewayProxyResultV2<any>> => {
  try {
    const email = await getReceivedById(accountId, emailId)
    try {
      // Emails stored before the spam filter have no folder, and `replace` on an absent member is
      // rejected by applyPatch, so the absent folder is made explicit as the Inbox it already means.
      return await applyJsonPatch({ ...email, folder: email.folder ?? 'inbox' }, accountId, emailId, patchOperations)
    } catch (error: unknown) {
      return { ...status.BAD_REQUEST, body: JSON.stringify({ message: (error as any).message }) }
    }
  } catch {
    return status.NOT_FOUND
  }
}

export const patchEmailHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', redactEvent(event))
  try {
    const accountId = event.pathParameters?.accountId as string
    const emailId = event.pathParameters?.emailId as string
    if (!validateUsernameInEvent(event, accountId)) {
      return status.FORBIDDEN
    }

    const patchOperations = extractJsonPatchFromEvent(event)
    if (!patchOperations.every(isAllowedPatchOperation)) {
      return status.FORBIDDEN
    }
    if (!patchOperations.every(isValidPatchValue)) {
      return {
        ...status.BAD_REQUEST,
        body: JSON.stringify({ message: `folder must be one of ${EMAIL_FOLDERS.join(', ')}` }),
      }
    }
    const result = await patchById(accountId, emailId, patchOperations)
    return result
  } catch (error: unknown) {
    return { ...status.BAD_REQUEST, body: JSON.stringify({ message: (error as any).message }) }
  }
}
