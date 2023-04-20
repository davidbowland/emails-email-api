import { copyS3Object, deleteS3Object, getS3Object, getSignedS3Url, putS3Object, uploadS3Object } from '@services/s3'
import { emailBucket } from '@config'

const mockSend = jest.fn()
jest.mock('@aws-sdk/client-s3', () => ({
  CopyObjectCommand: jest.fn().mockImplementation((x) => x),
  DeleteObjectCommand: jest.fn().mockImplementation((x) => x),
  GetObjectCommand: jest.fn().mockImplementation((x) => x),
  PutObjectCommand: jest.fn().mockImplementation((x) => x),
  S3Client: jest.fn(() => ({
    send: (...args) => mockSend(...args),
  })),
}))
const mockCreatePresignedPost = jest.fn()
jest.mock('@aws-sdk/s3-presigned-post', () => ({
  createPresignedPost: (...args) => mockCreatePresignedPost(...args),
}))
const mockGetSignedUrl = jest.fn()
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args) => mockGetSignedUrl(...args),
}))
jest.mock('@utils/logging', () => ({
  xrayCapture: jest.fn().mockImplementation((x) => x),
}))

describe('S3', () => {
  const key = 'prefix/key'

  describe('copyS3Object', () => {
    const fromKey = 'prefix/another-key'

    beforeAll(() => {
      mockSend.mockResolvedValue({})
    })

    test('expect keys passed to S3 as object', async () => {
      await copyS3Object(fromKey, key)

      expect(mockSend).toHaveBeenCalledWith({
        Bucket: emailBucket,
        CopySource: `/${emailBucket}/${fromKey}`,
        Key: key,
      })
    })

    test('expect reject when promise rejects', async () => {
      const rejectReason = 'unable to foo the bar'
      mockSend.mockRejectedValueOnce(rejectReason)

      await expect(copyS3Object(fromKey, key)).rejects.toEqual(rejectReason)
    })
  })

  describe('deleteS3Object', () => {
    test('expect key passed to mock', async () => {
      await deleteS3Object(key)

      expect(mockSend).toHaveBeenCalledWith({
        Bucket: emailBucket,
        Key: key,
      })
    })

    test('expect reject when promise rejects', async () => {
      const rejectReason = 'unable to foo the bar'
      mockSend.mockRejectedValueOnce(rejectReason)

      await expect(deleteS3Object(key)).rejects.toEqual(rejectReason)
    })
  })

  describe('getS3Object', () => {
    const expectedObject = Buffer.from('thar-be-values-here')

    const mockBuffer = {
      on: jest.fn().mockImplementation((action, predicate) => {
        if (action === 'data') {
          predicate(expectedObject)
        } else if (action === 'end') {
          predicate()
        }
      }),
    }

    beforeAll(() => {
      mockSend.mockResolvedValue({
        Body: mockBuffer,
        Metadata: {
          checksum: 'b51826af8a0b0f689395e27eee5a10c6',
          contentdisposition: 'attachment',
          contenttype: 'application/pdf',
          filename: 'EU-Business-Register.pdf',
          headers: '{}',
          related: 'undefined',
          size: '141119',
        },
      })
    })

    test('expect key passed to S3 as object', async () => {
      await getS3Object(key)

      expect(mockSend).toHaveBeenCalledWith({ Bucket: emailBucket, Key: key })
    })

    test('expect expectedObject as result', async () => {
      const result = await getS3Object(key)

      expect(result).toEqual({
        body: expectedObject,
        metadata: {
          checksum: 'b51826af8a0b0f689395e27eee5a10c6',
          contentdisposition: 'attachment',
          contenttype: 'application/pdf',
          filename: 'EU-Business-Register.pdf',
          headers: '{}',
          related: 'undefined',
          size: '141119',
        },
      })
    })
  })

  describe('getSignedS3Url', () => {
    const signedUrl = 'http://localhost/some/really/long/url#with-an-access-key'

    beforeAll(() => {
      mockGetSignedUrl.mockResolvedValue(signedUrl)
    })

    test('expect key and data passed to S3 as object', async () => {
      await getSignedS3Url(key)

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        {
          Bucket: emailBucket,
          Key: key,
        },
        { expiresIn: 300 }
      )
    })

    test('expect result matches expected result', async () => {
      const result = await getSignedS3Url(key)

      expect(result).toEqual(signedUrl)
    })
  })

  describe('putS3Object', () => {
    const metadata = {
      'Content-Type': 'text/plain',
    }
    const valueToPut = 'Hello, world!'

    test('expect key and data passed to S3 as object', async () => {
      await putS3Object(key, valueToPut, metadata)

      expect(mockSend).toHaveBeenCalledWith({
        Body: valueToPut,
        Bucket: emailBucket,
        Key: key,
        Metadata: metadata,
      })
    })

    test('expect no metadata passed to S3 when omitted', async () => {
      await putS3Object(key, valueToPut)

      expect(mockSend).toHaveBeenCalledWith({
        Body: valueToPut,
        Bucket: emailBucket,
        Key: key,
        Metadata: {},
      })
    })

    test('expect reject when promise rejects', async () => {
      const rejectReason = 'unable to foo the bar'
      mockSend.mockRejectedValueOnce(rejectReason)

      await expect(putS3Object(key, valueToPut, metadata)).rejects.toEqual(rejectReason)
    })
  })

  describe('uploadS3Object', () => {
    const presignedPost = { fields: {}, url: 'http://localhost' }

    beforeAll(() => {
      mockCreatePresignedPost.mockResolvedValue(presignedPost)
    })

    test('expect key and data passed to S3 as object', async () => {
      await uploadS3Object(key)

      expect(mockCreatePresignedPost).toHaveBeenCalledWith(expect.anything(), {
        Bucket: emailBucket,
        Conditions: [['content-length-range', 0, 10_000_000]],
        Expires: 300,
        Key: key,
      })
    })

    test('expect result matches expected result', async () => {
      const result = await uploadS3Object(key)

      expect(result).toEqual(presignedPost)
    })
  })
})
