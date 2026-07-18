import { DynamoDB } from '@aws-sdk/client-dynamodb'
import * as AWSXRay from 'aws-xray-sdk-core'
import https from 'https'

import { APIGatewayProxyEventV2 } from '@types'
import { log, logError, redactEvent, xrayCapture, xrayCaptureHttps } from '@utils/logging'

jest.mock('aws-xray-sdk-core')

describe('logging', () => {
  beforeAll(() => {
    console.error = jest.fn()
    console.log = jest.fn()
  })

  describe('log', () => {
    it.each(['Hello', 0, null, undefined, { a: 1, b: 2 }])(
      'should call logFunc with message for value %s',
      async (value) => {
        const message = `Log message for value ${JSON.stringify(value)}`
        await log(message)

        expect(console.log).toHaveBeenCalledWith(message)
      },
    )
  })

  describe('logError', () => {
    it.each(['Hello', 0, null, undefined, { a: 1, b: 2 }])(
      'should call logFunc with error message for value %s',
      async (value) => {
        const message = `Error message for value ${JSON.stringify(value)}`
        const error = new Error(message)
        await logError(error)

        expect(console.error).toHaveBeenCalledWith(error)
      },
    )
  })

  describe('xrayCapture', () => {
    const capturedDynamodb = 'captured-dynamodb' as unknown as DynamoDB
    const dynamodb = 'dynamodb'

    beforeAll(() => {
      jest.mocked(AWSXRay).captureAWSv3Client.mockReturnValue(capturedDynamodb)
    })

    it('should use AWSXRay.captureAWSv3Client when x-ray is enabled (not running locally)', () => {
      process.env.AWS_SAM_LOCAL = 'false'
      const result = xrayCapture(dynamodb)

      expect(AWSXRay.captureAWSv3Client).toHaveBeenCalledWith(dynamodb)
      expect(result).toEqual(capturedDynamodb)
    })

    it('should return same object when x-ray is disabled (running locally)', () => {
      process.env.AWS_SAM_LOCAL = 'true'
      const result = xrayCapture(dynamodb)

      expect(AWSXRay.captureAWSv3Client).toHaveBeenCalledTimes(0)
      expect(result).toEqual(dynamodb)
    })
  })

  describe('xrayCaptureHttps', () => {
    it('should use AWSXRay.captureHTTPsGlobal when x-ray is enabled (not running locally)', () => {
      process.env.AWS_SAM_LOCAL = 'false'
      xrayCaptureHttps()

      expect(AWSXRay.captureHTTPsGlobal).toHaveBeenCalledWith(https)
    })

    it('should not call captureHTTPsGlobal when x-ray is disabled (running locally)', () => {
      process.env.AWS_SAM_LOCAL = 'true'
      xrayCaptureHttps()

      expect(AWSXRay.captureHTTPsGlobal).toHaveBeenCalledTimes(0)
    })
  })

  describe('redactEvent', () => {
    const event = {
      body: JSON.stringify({ secret: 'sauce' }),
      headers: {
        authorization: 'Bearer secret-jwt',
        Authorization: 'Bearer secret-jwt',
        'content-type': 'json',
        'x-api-key': 'super-secret-key',
      },
      requestContext: {
        authorizer: { jwt: { claims: { name: 'Jane Doe', phone_number: '+15551234567', sub: 'user-1' } } },
        identity: { apiKey: 'super-secret-key', sourceIp: '1.2.3.4' },
      },
    } as unknown as APIGatewayProxyEventV2

    it('should drop the body', () => {
      expect((redactEvent(event) as { body: unknown }).body).toBeUndefined()
    })

    it('should drop authorization and x-api-key headers (any casing) while other headers remain', () => {
      const result = redactEvent(event) as { headers: Record<string, string> }

      expect(result.headers.authorization).toBeUndefined()
      expect(result.headers.Authorization).toBeUndefined()
      expect(result.headers['x-api-key']).toBeUndefined()
      expect(result.headers['content-type']).toBe('json')
    })

    it('should keep only sub in jwt claims, dropping phone/name PII', () => {
      const result = redactEvent(event) as { requestContext: { authorizer: { jwt: { claims: unknown } } } }

      expect(result.requestContext.authorizer.jwt.claims).toEqual({ sub: 'user-1' })
    })

    it('should drop the REST API key value from requestContext.identity while other identity fields remain', () => {
      const result = redactEvent(event) as { requestContext: { identity: { apiKey: unknown; sourceIp: unknown } } }

      expect(result.requestContext.identity.apiKey).toBeUndefined()
      expect(result.requestContext.identity.sourceIp).toBe('1.2.3.4')
    })

    it('should pass through events without an authorizer or identity unchanged', () => {
      const unauthenticated = { headers: {}, requestContext: {} } as unknown as APIGatewayProxyEventV2
      const result = redactEvent(unauthenticated) as { requestContext: { authorizer: unknown; identity: unknown } }

      expect(result.requestContext.authorizer).toBeUndefined()
      expect(result.requestContext.identity).toBeUndefined()
    })

    // Realistic API Gateway REST (Lambda-proxy v1) event: v1 events always populate multiValueHeaders
    // alongside headers, duplicating every header (including Authorization/x-api-key) into a second field.
    const v1RestEvent = {
      body: JSON.stringify({ secret: 'sauce' }),
      headers: {
        Authorization: 'Bearer secret-jwt',
        'Content-Type': 'json',
        'X-Api-Key': 'super-secret-key',
      },
      multiValueHeaders: {
        Authorization: ['Bearer secret-jwt'],
        'Content-Type': ['json'],
        'X-Api-Key': ['super-secret-key'],
      },
      requestContext: {
        identity: { apiKey: 'super-secret-key', sourceIp: '5.6.7.8' },
      },
    } as unknown as APIGatewayProxyEventV2

    it('should redact authorization and x-api-key from multiValueHeaders (any casing) while other headers remain', () => {
      const result = redactEvent(v1RestEvent) as { multiValueHeaders: Record<string, string[]> }

      expect(result.multiValueHeaders.Authorization).toBeUndefined()
      expect(result.multiValueHeaders['X-Api-Key']).toBeUndefined()
      expect(result.multiValueHeaders['Content-Type']).toEqual(['json'])
    })

    it('should redact both headers and multiValueHeaders together on the same v1 event', () => {
      const result = redactEvent(v1RestEvent) as {
        headers: Record<string, string>
        multiValueHeaders: Record<string, string[]>
      }

      expect(result.headers.Authorization).toBeUndefined()
      expect(result.headers['X-Api-Key']).toBeUndefined()
      expect(result.multiValueHeaders.Authorization).toBeUndefined()
      expect(result.multiValueHeaders['X-Api-Key']).toBeUndefined()
    })

    it('should pass through events without multiValueHeaders (HTTP API v2) without adding the field', () => {
      const result = redactEvent(event) as { multiValueHeaders: unknown }

      expect(result.multiValueHeaders).toBeUndefined()
    })
  })
})
