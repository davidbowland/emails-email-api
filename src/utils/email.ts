import { Email } from '../types'

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

export const canEmailBeBounced = (email: Email): boolean => {
  const now = Date.now()
  const emailTimestamp = email.timestamp
  return now - emailTimestamp < TWENTY_FOUR_HOURS_MS
}
