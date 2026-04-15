import utils from './utils'

describe('utils', () => {
  describe('sleep', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('resolves after n * 1000 ms', async () => {
      const promise = utils.sleep(3)
      jest.advanceTimersByTime(3000)
      await expect(promise).resolves.toBeUndefined()
    })
  })
})
