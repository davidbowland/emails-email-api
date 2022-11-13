import { S3 } from 'aws-sdk'

import { AttachmentContents, StringObject } from '../types'
import { emailBucket } from '../config'
import { xrayCapture } from '../utils/logging'

const s3 = xrayCapture(new S3({ apiVersion: '2006-03-01' }))

export const copyS3Object = (from: string, to: string): Promise<S3.CopyObjectOutput> =>
  s3.copyObject({ Bucket: emailBucket, CopySource: `/${emailBucket}/${from}`, Key: to }).promise()

export const deleteS3Object = (key: string): Promise<S3.DeleteObjectOutput> =>
  s3.deleteObject({ Bucket: emailBucket, Key: key }).promise()

export const getS3Object = (key: string): Promise<AttachmentContents> =>
  s3
    .getObject({ Bucket: emailBucket, Key: key })
    .promise()
    .then((result: any) => ({ body: result.Body as string, metadata: result.Metadata }))

export const putS3Object = (
  key: string,
  body: Buffer | string,
  metadata: StringObject = {}
): Promise<S3.PutObjectOutput> =>
  s3.putObject({ Body: body, Bucket: emailBucket, Key: key, Metadata: metadata }).promise()
