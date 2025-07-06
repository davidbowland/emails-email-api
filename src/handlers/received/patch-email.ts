import { applyPatch } from 'fast-json-patch'

import { mutateObjectOnJsonPatch, throwOnInvalidJsonPatch } from '../../config'
import { getReceivedById, setReceivedById } from '../../services/dynamodb'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Email, PatchOperation } from '../../types'
import { extractJsonPatchFromEvent, validateUsernameInEvent } from '../../utils/events'
import { log, logError } from '../../utils/logging'
import status from '../../utils/status'

const applyJsonPatch = async (
  email: Email,
  accountId: string,
  emailId: string,
  patchOperations: PatchOperation[],
): Promise<APIGatewayProxyResultV2<string>> => {
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
): Promise<APIGatewayProxyResultV2<string>> => {
  try {
    const email = await getReceivedById(accountId, emailId)
    try {
      return await applyJsonPatch(email, accountId, emailId, patchOperations)
    } catch (error: unknown) {
      return { ...status.BAD_REQUEST, body: JSON.stringify({ message: (error as any).message }) }
    }
  } catch {
    return status.NOT_FOUND
  }
}

export const patchEmailHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<string>> => {
  log('Received event', { ...event, body: undefined })
  try {
    const accountId = event.pathParameters?.accountId as string
    const emailId = event.pathParameters?.emailId as string
    if (!validateUsernameInEvent(event, accountId)) {
      return status.FORBIDDEN
    }

    const patchOperations = extractJsonPatchFromEvent(event)
    if (!patchOperations.every((value) => value.path === '/viewed')) {
      return status.FORBIDDEN
    }
    const result = await patchById(accountId, emailId, patchOperations)
    return result
  } catch (error: unknown) {
    return { ...status.BAD_REQUEST, body: JSON.stringify({ message: (error as any).message }) }
  }
}
