import axios from 'axios'

import { queueApiKey, queueApiUrl } from '../config'
import { BounceOutbound, EmailOutbound, QueueResponse } from '../types'
import { xrayCaptureHttps } from '../utils/logging'

xrayCaptureHttps()
const api = axios.create({
  baseURL: queueApiUrl,
  headers: { 'x-api-key': queueApiKey },
})

export const sendEmail = (email: EmailOutbound): Promise<QueueResponse> =>
  api.post('/emails', email, {}).then((response) => response.data)

export const bounceEmail = (email: BounceOutbound): Promise<QueueResponse> =>
  api.post('/bounces', email, {}).then((response) => response.data)
