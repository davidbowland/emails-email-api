import { sendNotification } from 'web-push'

import { ssmVapidPrivateKeyPath, ssmVapidPublicKeyPath, vapidSubject } from '../config'
import { PushPayload, PushSubscription } from '../types'
import { log } from '../utils/logging'
import { getParameter, memoized } from './ssm'

// Memoized independently: GetVapidPublicKeyFunction is not granted ssm:GetParameter on the private
// key, so a shared reader would make that endpoint throw ValidationException on every request.
export const getVapidPublicKey = memoized(() => getParameter(ssmVapidPublicKeyPath))

const getVapidPrivateKey = memoized(() => getParameter(ssmVapidPrivateKeyPath))

const GONE_STATUS_CODES = new Set([404, 410])

interface VapidDetails {
  privateKey: string
  publicKey: string
  subject: string
}

// Returns the subscription when it should be kept, undefined when the push service says it is gone.
// A failed send is logged with `log`, not `logError`: every LogGroup here pages a human on ERROR,
// and a dead device is a routine outcome, not a fault.
const sendToSubscription = async (
  subscription: PushSubscription,
  body: string,
  vapidDetails: VapidDetails,
): Promise<PushSubscription | undefined> => {
  try {
    await sendNotification(subscription, body, { vapidDetails })
    return subscription
  } catch (error: unknown) {
    const statusCode = (error as { statusCode?: number })?.statusCode
    log('Push send failed', { statusCode })
    return GONE_STATUS_CODES.has(statusCode as number) ? undefined : subscription
  }
}

export const sendPushNotifications = async (
  subscriptions: PushSubscription[],
  payload: PushPayload,
): Promise<PushSubscription[]> => {
  const vapidDetails = {
    privateKey: await getVapidPrivateKey(),
    publicKey: await getVapidPublicKey(),
    subject: vapidSubject,
  }
  const body = JSON.stringify(payload)
  const results = await Promise.all(
    subscriptions.map((subscription) => sendToSubscription(subscription, body, vapidDetails)),
  )
  return results.filter((subscription): subscription is PushSubscription => subscription !== undefined)
}
