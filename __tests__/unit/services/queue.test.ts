import axios from 'axios'

import { emailId, messageId, outboundEmail } from '../__mocks__'
import { bounceEmail, sendEmail } from '@services/queue'
import * as ssm from '@services/ssm'

const mockPost = jest.fn()
// The interceptor list lives inside the mock factory rather than at module scope: queue.ts registers
// its interceptor while this file's imports are still evaluating, before a module-scope `const` would
// be initialized. Reading it from `mockRequestUse.mock.calls` is no good either -- `clearMocks` wipes
// call records before the first test runs.
jest.mock('axios', () => {
  const requestInterceptors: ((config: any) => Promise<any>)[] = []
  return {
    create: jest.fn().mockImplementation(() => ({
      interceptors: { request: { use: (onFulfilled) => requestInterceptors.push(onFulfilled) } },
      post: (...args) => mockPost(...args),
    })),
    requestInterceptors,
  }
})
jest.mock('axios-retry')
jest.mock('@services/ssm', () => ({
  getParameter: jest.fn(),
  memoized: jest.fn().mockImplementation((fetchValue) => fetchValue),
}))
jest.mock('@utils/logging')

describe('queue', () => {
  const requestInterceptors = (axios as unknown as { requestInterceptors: ((config: any) => Promise<any>)[] })
    .requestInterceptors

  beforeAll(() => {
    mockPost.mockResolvedValue({ data: { messageId } })
    jest.mocked(ssm).getParameter.mockResolvedValue('a-queue-api-key')
  })

  describe('x-api-key interceptor', () => {
    it('should set the header from the SSM parameter', async () => {
      const result = await requestInterceptors[0]({ headers: {} })

      expect(jest.mocked(ssm).getParameter).toHaveBeenCalledWith('/emails-test/queue-api-key')
      expect(result.headers['x-api-key']).toEqual('a-queue-api-key')
    })
  })

  describe('sendEmail', () => {
    it('should send email and return messageId', async () => {
      const result = await sendEmail(outboundEmail)

      expect(mockPost).toHaveBeenCalledWith('/emails', outboundEmail, {})
      expect(result).toEqual({ messageId })
    })
  })

  describe('bounceEmail', () => {
    it('should bounce email and return messageId', async () => {
      const bounceData = {
        bounceSender: 'sender@domain.com',
        messageId: emailId,
        recipients: ['test@domain.com'],
      }
      const result = await bounceEmail(bounceData)

      expect(mockPost).toHaveBeenCalledWith('/bounces', bounceData, {})
      expect(result).toEqual({ messageId })
    })
  })
})
