import { applyPatch } from 'fast-json-patch'

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Email, PatchOperation } from '../../types'
import { extractJsonPatchFromEvent, extractUsernameFromEvent } from '../../utils/events'
import { getReceivedById, setReceivedById } from '../../services/dynamodb'
import { log, logError } from '../../utils/logging'
import { mutateObjectOnJsonPatch, throwOnInvalidJsonPatch } from '../../config'
import status from '../../utils/status'

const applyJsonPatch = async (
  email: Email,
  accountId: string,
  emailId: string,
  patchOperations: PatchOperation[]
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
  patchOperations: PatchOperation[]
): Promise<APIGatewayProxyResultV2<any>> => {
  try {
    const email = await getReceivedById(accountId, emailId)
    try {
      return await applyJsonPatch(email, accountId, emailId, patchOperations)
    } catch (error: any) {
      return { ...status.BAD_REQUEST, body: JSON.stringify({ message: error.message }) }
    }
  } catch {
    return status.NOT_FOUND
  }
}

export const patchEmailHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', { ...event, body: undefined })
  try {
    const accountId = event.pathParameters?.accountId as string
    const emailId = event.pathParameters?.emailId as string
    if (accountId !== extractUsernameFromEvent(event)) {
      return status.FORBIDDEN
    }

    const patchOperations = extractJsonPatchFromEvent(event)
    if (!patchOperations.every((value) => value.path === '/viewed')) {
      return status.FORBIDDEN
    }
    const result = await patchById(accountId, emailId, patchOperations)
    return result
  } catch (error: any) {
    return { ...status.BAD_REQUEST, body: JSON.stringify({ message: error.message }) }
  }
}
