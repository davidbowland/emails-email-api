import {
  CopyObjectCommand,
  CopyObjectOutput,
  DeleteObjectCommand,
  DeleteObjectOutput,
  GetObjectCommand,
  GetObjectOutput,
  PutObjectCommand,
  PutObjectOutput,
  S3Client,
} from '@aws-sdk/client-s3'
import { createPresignedPost, PresignedPost } from '@aws-sdk/s3-presigned-post'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Readable } from 'stream'

import { emailBucket, maxUploadSize } from '../config'
import { AttachmentContents, StringObject } from '../types'
import { xrayCapture } from '../utils/logging'

const s3 = xrayCapture(new S3Client({ apiVersion: '2006-03-01' }))

export const copyS3Object = async (from: string, to: string): Promise<CopyObjectOutput> => {
  const command = new CopyObjectCommand({ Bucket: emailBucket, CopySource: `/${emailBucket}/${from}`, Key: to })
  return s3.send(command)
}

export const deleteS3Object = async (key: string): Promise<DeleteObjectOutput> => {
  const command = new DeleteObjectCommand({ Bucket: emailBucket, Key: key })
  return s3.send(command)
}

const readableToBuffer = (stream: Readable): Promise<Buffer> =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks)))
  })

export const getS3Object = async (key: string): Promise<AttachmentContents> => {
  const command = new GetObjectCommand({ Bucket: emailBucket, Key: key })
  const response: GetObjectOutput = await s3.send(command)
  const body = await readableToBuffer(response.Body as Readable)
  return { body: body, metadata: response.Metadata }
}

export const getSignedS3Url = async (key: string): Promise<string> => {
  const command = new GetObjectCommand({ Bucket: emailBucket, Key: key })
  return getSignedUrl(s3, command, { expiresIn: 300 })
}

export const putS3Object = async (
  key: string,
  body: Buffer | string,
  metadata: StringObject = {},
): Promise<PutObjectOutput> => {
  const command = new PutObjectCommand({ Body: body, Bucket: emailBucket, Key: key, Metadata: metadata })
  return s3.send(command)
}

export const uploadS3Object = async (key: string): Promise<PresignedPost> =>
  createPresignedPost(s3, {
    Bucket: emailBucket,
    Conditions: [['content-length-range', 0, parseInt(maxUploadSize, 10)]],
    Expires: 300,
    Key: key,
  })
