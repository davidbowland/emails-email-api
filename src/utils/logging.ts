import AWSXRay from 'aws-xray-sdk-core'

export const log = (...args: any[]): unknown => console.log(...args)

export const logError = (...args: any[]): unknown => console.error(...args)

export const xrayCapture = (x: any) => (process.env.AWS_SAM_LOCAL === 'true' ? x : AWSXRay.captureAWSClient(x))
