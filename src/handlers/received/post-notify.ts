import { assertRequiredEnv } from '../../config'
import {
  getAccountById,
  getPushSubscriptionsById,
  getReceivedById,
  setPushSubscriptionsById,
} from '../../services/dynamodb'
import { sendPushNotifications } from '../../services/push'
import {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  DEFAULT_NOTIFICATION_PREVIEW,
  Email,
  NotificationPreview,
} from '../../types'
import { log, logError, redactEvent } from '../../utils/logging'
import { buildPushPayload, fitPushPayload } from '../../utils/push'
import status from '../../utils/status'

assertRequiredEnv(
  'DYNAMODB_ACCOUNTS_TABLE_NAME',
  'DYNAMODB_PUSH_SUBSCRIPTIONS_TABLE_NAME',
  'DYNAMODB_RECEIVED_TABLE_NAME',
  'SSM_VAPID_PRIVATE_KEY_PATH',
  'SSM_VAPID_PUBLIC_KEY_PATH',
  'VAPID_SUBJECT',
)

const isSentinel = (error: unknown, message: string): boolean => (error as Error)?.message === message

// getAccountById throws 'Account not found' rather than returning undefined. A missing account is
// treated as the default preview -- but ONLY that sentinel. A ThrottlingException, a socket timeout
// or an AccessDeniedException must not be read as "no stored preference", because defaulting on an
// infrastructure fault would put the sender and the subject on the lock screen of somebody who chose
// 'none'. Anything else rethrows, becoming a 500 that logError puts in front of an admin.
const getNotificationPreview = async (accountId: string): Promise<NotificationPreview> => {
  try {
    const account = await getAccountById(accountId)
    return account.notificationPreview
  } catch (error) {
    if (!isSentinel(error, 'Account not found')) {
      throw error
    }
    log('Account not found for notify, using the default preview', { accountId })
    return DEFAULT_NOTIFICATION_PREVIEW
  }
}

// getReceivedById throws 'Email not found'. Nothing retries a notify call, so a missing email is a
// warning and a 204, not an error.
const getEmail = async (accountId: string, emailId: string): Promise<Email | undefined> => {
  try {
    return await getReceivedById(accountId, emailId)
  } catch {
    log('Email not found for notify', { accountId, emailId })
    return undefined
  }
}

// 204 for every outcome the handler can reach as a delivery result: absent account, absent email,
// empty subscription array, and any number of failed sends. 500 only when the account table, the
// subscription table or SSM throws -- an infrastructure fault worth an alarm.
export const notifyEmailHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', redactEvent(event))
  try {
    const accountId = event.pathParameters?.accountId as string
    const emailId = event.pathParameters?.emailId as string

    const preview = await getNotificationPreview(accountId)
    const email = await getEmail(accountId, emailId)
    if (email === undefined) {
      return status.NO_CONTENT
    }

    const subscriptions = await getPushSubscriptionsById(accountId)
    if (subscriptions.length === 0) {
      return status.NO_CONTENT
    }

    const payload = fitPushPayload(buildPushPayload(emailId, email, preview))
    const remaining = await sendPushNotifications(subscriptions, payload)
    if (remaining.length !== subscriptions.length) {
      log('Pruning push subscriptions the push service dropped', {
        accountId,
        pruned: subscriptions.length - remaining.length,
      })
      await setPushSubscriptionsById(accountId, remaining)
    }
    return status.NO_CONTENT
  } catch (error) {
    logError(error)
    return status.INTERNAL_SERVER_ERROR
  }
}
