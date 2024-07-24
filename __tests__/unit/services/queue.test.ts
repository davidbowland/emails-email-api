import { emailId, outboundEmail } from '../__mocks__'
import { http, HttpResponse, server } from '@setup-server'
import { queueApiKey, queueApiUrl } from '@config'
import { sendEmail } from '@services/queue'

jest.mock('@utils/logging')

describe('queue', () => {
  describe('sendEmail', () => {
    const postEndpoint = jest.fn().mockReturnValue({ messageId: emailId })

    beforeAll(() => {
      server.use(
        http.post(`${queueApiUrl}/emails`, async ({ request }) => {
          if (queueApiKey != request.headers.get('x-api-key')) {
            return new HttpResponse(JSON.stringify({ error: 'Invalid API key' }), { status: 403 })
          }

          const body = postEndpoint(await request.json())
          return body ? HttpResponse.json(body) : new HttpResponse(null, { status: 400 })
        })
      )
    })

    test('expect email contents to be passed to the endpoint', async () => {
      await sendEmail(outboundEmail)

      expect(postEndpoint).toHaveBeenCalledWith(outboundEmail)
    })

    test('expect sendEmail returns messageId', async () => {
      const result = await sendEmail(outboundEmail)

      expect(result).toEqual({ messageId: '7yh8g-7ytguy-98ui8u-5efka-87y87y' })
    })
  })
})
