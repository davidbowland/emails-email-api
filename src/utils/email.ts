import { Email } from '../types'

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

export const canEmailBeBounced = (email: Email, now: () => number = Date.now): boolean =>
  now() - email.timestamp < TWENTY_FOUR_HOURS_MS
