import axios from 'axios'

import { EmailOutbound, EmailResponse } from '../types'
import { queueApiKey, queueApiUrl } from '../config'
import { xrayCaptureHttps } from '../utils/logging'

xrayCaptureHttps()
const api = axios.create({
  baseURL: queueApiUrl,
  headers: { 'x-api-key': queueApiKey },
})

export const sendEmail = (email: EmailOutbound): Promise<EmailResponse> =>
  api.post('/emails', email, {}).then((response) => response.data)
