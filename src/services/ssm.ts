import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'

import { xrayCapture } from '../utils/logging'

const ssm = xrayCapture(new SSMClient({}))

export const getParameter = async (name: string): Promise<string> => {
  const command = new GetParameterCommand({ Name: name, WithDecryption: true })
  const response = await ssm.send(command)
  const value = response.Parameter?.Value
  if (value === undefined) {
    throw new Error(`SSM parameter ${name} has no value`)
  }
  return value
}

// Each parameter is memoized independently, per warm container. Independence is a security
// structure, not a performance one: GetVapidPublicKeyFunction is deliberately not granted
// ssm:GetParameter on the private key, so resolving the public key must never reach for the
// private one.
//
// The PROMISE is cached, not the resolved value. Caching the value would guard on `cached` before
// the first await had resolved, so two overlapping calls on a cold container would both reach SSM
// and only the second's result would be kept -- "fetched once" would be a claim this comment made
// and the code did not keep. Every call path is sequential today; that is a fact about the callers,
// not a property of this function.
//
// A rejection clears the cache so a single throttle or timeout does not wedge the container for the
// rest of its life. The alternative -- a cached rejected promise -- turns one bad second into every
// subsequent invocation on that container failing identically, with nothing to retry into.
export const memoized = (fetchValue: () => Promise<string>): (() => Promise<string>) => {
  let cached: Promise<string> | undefined
  return async (): Promise<string> =>
    (cached ??= fetchValue().catch((error) => {
      cached = undefined
      throw error
    }))
}
