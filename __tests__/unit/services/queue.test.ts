import { emailId, outboundEmail } from '../__mocks__'
import { queueApiKey, queueApiUrl } from '@config'
import { rest, server } from '@setup-server'
import { sendEmail } from '@services/queue'

jest.mock('@utils/logging')

describe('queue', () => {
  describe('sendEmail', () => {
    const postEndpoint = jest.fn().mockReturnValue({ messageId: emailId })

    beforeAll(() => {
      server.use(
        rest.post(`${queueApiUrl}/emails`, async (req, res, ctx) => {
          if (queueApiKey != req.headers.get('x-api-key')) {
            return res(ctx.status(403))
          }

          const body = postEndpoint(await req.json())
          return res(body ? ctx.json(body) : ctx.status(400))
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
