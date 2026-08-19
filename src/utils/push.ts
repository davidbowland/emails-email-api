import { Email, NotificationPreview, PushPayload } from '../types'
import { log } from './logging'

// RFC 8291 guarantees 4096 bytes of ciphertext; minus 16 salt, 4 record size, 1 key-id length, 65
// key id, 16 GCM tag and 1 padding delimiter leaves 3993 plaintext bytes. 3500 keeps headroom.
export const PUSH_PAYLOAD_MAX_BYTES = 3500
export const PUSH_SENDER_LABEL_MAX_LENGTH = 100
export const PUSH_SUBJECT_MAX_LENGTH = 200

const ANGLE_ADDRESS = /^(.*)<([^>]*)>\s*$/

// The stored `from` holds a full RFC 5322 header value such as "Sarah Smith" <sarah@example.com>.
// Parsing that in a service worker would be wrong, so the display name is extracted here, falling
// back to the bare address.
export const extractSenderLabel = (from: string | undefined): string | undefined => {
  const trimmed = (from ?? '').trim()
  const match = ANGLE_ADDRESS.exec(trimmed)
  if (match === null) {
    return trimmed === '' ? undefined : trimmed
  }
  const displayName = match[1]
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .trim()
  return displayName || match[2].trim() || undefined
}

// Counted in code points so an emoji is never split into a lone surrogate.
export const truncateForPush = (text: string, maxLength: number): string => {
  const characters = [...text]
  return characters.length <= maxLength ? text : `${characters.slice(0, maxLength).join('')}…`
}

// Privacy tiering by omission: what a recipient asked not to see never leaves the Lambda. `subject`
// is never sent without `senderLabel`, which is also why fitPushPayload sheds in that order.
export const buildPushPayload = (emailId: string, email: Email, preview: NotificationPreview): PushPayload => {
  const senderLabel = preview === 'none' ? undefined : extractSenderLabel(email.from)
  if (senderLabel === undefined) {
    return { emailId }
  }
  const truncatedLabel = truncateForPush(senderLabel, PUSH_SENDER_LABEL_MAX_LENGTH)
  if (preview !== 'sender-and-subject' || !email.subject) {
    return { emailId, senderLabel: truncatedLabel }
  }
  return {
    emailId,
    senderLabel: truncatedLabel,
    subject: truncateForPush(email.subject, PUSH_SUBJECT_MAX_LENGTH),
  }
}

const payloadBytes = (payload: PushPayload): number => Buffer.byteLength(JSON.stringify(payload), 'utf8')

// Neither shed branch below can run against anything buildPushPayload produces, and that is the
// intended state, not dead code to delete. Both text fields are capped before this is called --
// subject at 200 code points, senderLabel at 100 -- so the widest possible payload is roughly 1250
// bytes of the 3500-byte budget even when every character costs four bytes. This function exists so
// that adding a THIRD field, or an uncapped one, cannot silently push a notification past the RFC
// 8291 ciphertext limit: the push service would reject the send, no subscription would be pruned
// (only 404 and 410 prune), and the device would simply never hear about the email. The check is
// cheap; discovering that failure in production is not. `__tests__/unit/utils/push.test.ts` pins
// the headroom, so a future cap change fails there rather than in the field.
export const fitPushPayload = (payload: PushPayload): PushPayload => {
  if (payloadBytes(payload) <= PUSH_PAYLOAD_MAX_BYTES) {
    return payload
  }
  log('Push payload over budget, shedding subject', { emailId: payload.emailId })
  const withoutSubject = { emailId: payload.emailId, senderLabel: payload.senderLabel }
  if (payloadBytes(withoutSubject) <= PUSH_PAYLOAD_MAX_BYTES) {
    return withoutSubject
  }
  log('Push payload over budget, shedding senderLabel', { emailId: payload.emailId })
  return { emailId: payload.emailId }
}
