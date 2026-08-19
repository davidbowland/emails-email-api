import { getParameter, memoized } from '@services/ssm'

const mockSend = jest.fn()
jest.mock('@aws-sdk/client-ssm', () => ({
  GetParameterCommand: jest.fn().mockImplementation((x) => x),
  SSMClient: jest.fn(() => ({
    send: (...args) => mockSend(...args),
  })),
}))
jest.mock('@utils/logging', () => ({
  xrayCapture: jest.fn().mockImplementation((x) => x),
}))

describe('ssm', () => {
  describe('getParameter', () => {
    beforeAll(() => {
      mockSend.mockResolvedValue({ Parameter: { Value: 'a-secret-value' } })
    })

    it('should request the parameter with decryption', async () => {
      await getParameter('/emails-test/queue-api-key')

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ Name: '/emails-test/queue-api-key', WithDecryption: true }),
      )
    })

    it('should return the parameter value', async () => {
      const result = await getParameter('/emails-test/queue-api-key')

      expect(result).toEqual('a-secret-value')
    })

    it('should throw when the parameter has no value', async () => {
      mockSend.mockResolvedValueOnce({ Parameter: {} })

      await expect(getParameter('/emails-test/queue-api-key')).rejects.toThrow(
        'SSM parameter /emails-test/queue-api-key has no value',
      )
    })
  })

  describe('memoized', () => {
    it('should invoke the fetcher once for repeated calls', async () => {
      const fetchValue = jest.fn().mockResolvedValue('cached-value')
      const getValue = memoized(fetchValue)

      const first = await getValue()
      const second = await getValue()

      expect(fetchValue).toHaveBeenCalledTimes(1)
      expect(first).toEqual('cached-value')
      expect(second).toEqual('cached-value')
    })

    it('should invoke the fetcher once for overlapping calls', async () => {
      const fetchValue = jest.fn().mockResolvedValue('cached-value')
      const getValue = memoized(fetchValue)

      const [first, second] = await Promise.all([getValue(), getValue()])

      expect(fetchValue).toHaveBeenCalledTimes(1)
      expect(first).toEqual('cached-value')
      expect(second).toEqual('cached-value')
    })

    it('should fetch again after a rejected fetch', async () => {
      const fetchValue = jest.fn().mockRejectedValueOnce(new Error('SSM unavailable')).mockResolvedValue('late-value')
      const getValue = memoized(fetchValue)

      await expect(getValue()).rejects.toThrow('SSM unavailable')
      const result = await getValue()

      expect(result).toEqual('late-value')
    })
  })
})
