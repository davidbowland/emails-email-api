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
export const memoized = (fetchValue: () => Promise<string>): (() => Promise<string>) => {
  let cached: string | undefined
  return async (): Promise<string> => (cached ??= await fetchValue())
}
