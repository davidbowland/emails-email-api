import { assertRequiredEnv } from '../config'
import { getVapidPublicKey } from '../services/push'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../types'
import { log, logError, redactEvent } from '../utils/logging'
import status from '../utils/status'

assertRequiredEnv('SSM_VAPID_PUBLIC_KEY_PATH')

// Authenticated, unlike an anonymous VAPID endpoint: emails-ui has no anonymous surface, so
// requiring the JWT costs nothing. The key still never enters the UI bundle -- SSM stays the single
// source of truth and the UI fetches it at runtime. There is no accountId to validate here.
export const getVapidPublicKeyHandler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', redactEvent(event))
  try {
    const publicKey = await getVapidPublicKey()
    return { ...status.OK, body: JSON.stringify({ publicKey }) }
  } catch (error) {
    logError(error)
    return status.INTERNAL_SERVER_ERROR
  }
}
