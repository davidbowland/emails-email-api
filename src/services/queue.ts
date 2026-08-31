import axios from 'axios'

import { queueApiUrl, ssmQueueApiKeyPath } from '../config'
import { BounceOutbound, EmailOutbound, QueueResponse } from '../types'
import { xrayCaptureHttps } from '../utils/logging'
import { getParameter, memoized } from './ssm'

xrayCaptureHttps()
const api = axios.create({ baseURL: queueApiUrl })

const getQueueApiKey = memoized(() => getParameter(ssmQueueApiKeyPath))

// A request interceptor rather than a header baked in at import time: the key is now an async SSM
// read, and this keeps every existing call site synchronous while making a stale header impossible.
api.interceptors.request.use(async (config) => {
  config.headers['x-api-key'] = await getQueueApiKey()
  return config
})

export const sendEmail = (email: EmailOutbound): Promise<QueueResponse> =>
  api.post('/emails', email, {}).then((response) => response.data)

export const bounceEmail = (email: BounceOutbound): Promise<QueueResponse> =>
  api.post('/bounces', email, {}).then((response) => response.data)
