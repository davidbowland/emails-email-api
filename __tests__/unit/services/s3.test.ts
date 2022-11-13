import { copyS3Object, deleteS3Object, getS3Object, putS3Object } from '@services/s3'
import { emailBucket } from '@config'

const mockCopyObject = jest.fn()
const mockDeleteObject = jest.fn()
const mockGetObject = jest.fn()
const mockPutObject = jest.fn()
jest.mock('aws-sdk', () => ({
  S3: jest.fn(() => ({
    copyObject: (...args) => ({ promise: () => mockCopyObject(...args) }),
    deleteObject: (...args) => ({ promise: () => mockDeleteObject(...args) }),
    getObject: (...args) => ({ promise: () => mockGetObject(...args) }),
    putObject: (...args) => ({ promise: () => mockPutObject(...args) }),
  })),
}))
jest.mock('@utils/logging', () => ({
  xrayCapture: jest.fn().mockImplementation((x) => x),
}))

describe('S3', () => {
  const key = 'prefix/key'

  describe('copyS3Object', () => {
    const fromKey = 'prefix/another-key'

    beforeAll(() => {
      mockCopyObject.mockResolvedValue({})
    })

    test('expect keys passed to S3 as object', async () => {
      await copyS3Object(fromKey, key)
      expect(mockCopyObject).toHaveBeenCalledWith({
        Bucket: emailBucket,
        CopySource: `/${emailBucket}/${fromKey}`,
        Key: key,
      })
    })

    test('expect reject when promise rejects', async () => {
      const rejectReason = 'unable to foo the bar'
      mockCopyObject.mockRejectedValueOnce(rejectReason)
      await expect(copyS3Object(fromKey, key)).rejects.toEqual(rejectReason)
    })
  })

  describe('deleteS3Object', () => {
    test('expect key passed to mock', async () => {
      await deleteS3Object(key)
      expect(mockDeleteObject).toHaveBeenCalledWith({
        Bucket: emailBucket,
        Key: key,
      })
    })

    test('expect reject when promise rejects', async () => {
      const rejectReason = 'unable to foo the bar'
      mockDeleteObject.mockRejectedValueOnce(rejectReason)
      await expect(deleteS3Object(key)).rejects.toEqual(rejectReason)
    })
  })

  describe('getS3Object', () => {
    const expectedObject = 'thar-be-values-here'

    beforeAll(() => {
      mockGetObject.mockResolvedValue({
        Body: expectedObject,
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
      expect(mockGetObject).toHaveBeenCalledWith({ Bucket: emailBucket, Key: key })
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

    test('expect empty result when body missing', async () => {
      mockGetObject.mockResolvedValueOnce({})
      const result = await getS3Object(key)
      expect(result).toEqual({ body: undefined, metadata: undefined })
    })
  })

  describe('putS3Object', () => {
    const metadata = {
      'Content-Type': 'text/plain',
    }
    const valueToPut = 'Hello, world!'

    test('expect key and data passed to S3 as object', async () => {
      await putS3Object(key, valueToPut, metadata)
      expect(mockPutObject).toHaveBeenCalledWith({
        Body: valueToPut,
        Bucket: emailBucket,
        Key: key,
        Metadata: metadata,
      })
    })

    test('expect no metadata passed to S3 when omitted', async () => {
      await putS3Object(key, valueToPut)
      expect(mockPutObject).toHaveBeenCalledWith({
        Body: valueToPut,
        Bucket: emailBucket,
        Key: key,
        Metadata: {},
      })
    })

    test('expect reject when promise rejects', async () => {
      const rejectReason = 'unable to foo the bar'
      mockPutObject.mockRejectedValueOnce(rejectReason)
      await expect(putS3Object(key, valueToPut, metadata)).rejects.toEqual(rejectReason)
    })
  })
})
