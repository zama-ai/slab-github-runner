import { getOctokit } from '@actions/github'
import { error as setError } from '@actions/core'
import utils from './utils'
import waitForRunnerRegistered, { RegistrationError } from './gh'

jest.mock('@actions/github', () => ({ getOctokit: jest.fn() }))
jest.mock('@actions/core', () => ({
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}))
jest.mock('./utils', () => ({
  __esModule: true,
  default: { sleep: jest.fn().mockResolvedValue(undefined) }
}))

const mockConfig = {
  input: { backend: 'aws', githubToken: 'test-token' },
  githubContext: { owner: 'test-owner', repo: 'test-repo' }
}

function makePaginate(runners) {
  return jest.fn().mockResolvedValue(runners)
}

describe('waitForRunnerRegistered', () => {
  it('returns when runner is online on first poll', async () => {
    getOctokit.mockReturnValue({
      paginate: makePaginate([{ name: 'runner-1', status: 'online' }])
    })

    await expect(
      waitForRunnerRegistered(mockConfig, 'runner-1')
    ).resolves.toBeUndefined()
    expect(utils.sleep).toHaveBeenCalledTimes(1)
  })

  it('polls again when runner is offline, succeeds when online', async () => {
    const paginate = jest
      .fn()
      .mockResolvedValueOnce([{ name: 'runner-1', status: 'offline' }])
      .mockResolvedValue([{ name: 'runner-1', status: 'online' }])
    getOctokit.mockReturnValue({ paginate })

    await expect(
      waitForRunnerRegistered(mockConfig, 'runner-1')
    ).resolves.toBeUndefined()
    expect(paginate).toHaveBeenCalledTimes(2)
  })

  it('polls again when runner is not found, succeeds when found online', async () => {
    const paginate = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ name: 'runner-1', status: 'online' }])
    getOctokit.mockReturnValue({ paginate })

    await expect(
      waitForRunnerRegistered(mockConfig, 'runner-1')
    ).resolves.toBeUndefined()
    expect(paginate).toHaveBeenCalledTimes(2)
  })

  it('treats runner as null and continues when paginate throws', async () => {
    const paginate = jest
      .fn()
      .mockRejectedValueOnce(new Error('API error'))
      .mockResolvedValue([{ name: 'runner-1', status: 'online' }])
    getOctokit.mockReturnValue({ paginate })

    await expect(
      waitForRunnerRegistered(mockConfig, 'runner-1')
    ).resolves.toBeUndefined()
    expect(setError).toHaveBeenCalledWith(expect.stringContaining('API error'))
  })

  it('throws when timeout is exceeded', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1.0)
    getOctokit.mockReturnValue({ paginate: makePaginate([]) })

    await expect(
      waitForRunnerRegistered(mockConfig, 'runner-1')
    ).rejects.toThrow(RegistrationError)
  })
})
