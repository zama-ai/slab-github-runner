import { getInput } from '@actions/core'
import {
  Config,
  ModeError,
  GithubTokenError,
  SlabUrlError,
  JobSecretError
} from './config'

jest.mock('@actions/core', () => ({ getInput: jest.fn() }))
jest.mock('@actions/github', () => ({
  context: {
    repo: { owner: 'test-owner', repo: 'test-repo' },
    sha: 'test-sha',
    ref: 'refs/heads/main'
  }
}))

function makeInputs(overrides = {}) {
  const defaults = {
    mode: 'start',
    'github-token': 'token123',
    'slab-url': 'http://slab.test',
    'job-secret': 'secret123',
    backend: 'aws',
    profile: 'test-profile',
    label: 'runner-1'
  }
  const merged = Object.assign({}, defaults, overrides)
  getInput.mockImplementation(name => merged[name] || '')
}

describe('Config', () => {
  it('constructs successfully for start mode', () => {
    makeInputs()
    expect(() => new Config()).not.toThrow()
  })

  it('constructs successfully for stop mode', () => {
    makeInputs({ mode: 'stop' })
    expect(() => new Config()).not.toThrow()
  })

  it('populates input fields correctly', () => {
    makeInputs()
    const config = new Config()

    expect(config.input.mode).toBe('start')
    expect(config.input.githubToken).toBe('token123')
    expect(config.input.slabUrl).toBe('http://slab.test')
    expect(config.input.jobSecret).toBe('secret123')
  })

  it('lowercases backend and profile', () => {
    makeInputs({ backend: 'AWS', profile: 'Test-Profile' })
    const config = new Config()

    expect(config.input.backend).toBe('aws')
    expect(config.input.profile).toBe('test-profile')
  })

  it('populates githubContext from mocked context', () => {
    makeInputs()
    const config = new Config()

    expect(config.githubContext.owner).toBe('test-owner')
    expect(config.githubContext.repo).toBe('test-repo')
    expect(config.githubContext.sha).toBe('test-sha')
    expect(config.githubContext.ref).toBe('refs/heads/main')
  })

  it('throws when mode is missing', () => {
    makeInputs({ mode: '' })
    expect(() => new Config()).toThrow(ModeError)
  })

  it('throws when github-token is missing', () => {
    makeInputs({ 'github-token': '' })
    expect(() => new Config()).toThrow(GithubTokenError)
  })

  it('throws when slab-url is missing', () => {
    makeInputs({ 'slab-url': '' })
    expect(() => new Config()).toThrow(SlabUrlError)
  })

  it('throws when job-secret is missing', () => {
    makeInputs({ 'job-secret': '' })
    expect(() => new Config()).toThrow(JobSecretError)
  })

  it('throws when backend is missing in start mode', () => {
    makeInputs({ backend: '' })
    expect(() => new Config()).toThrow(ModeError)
  })

  it('throws when profile is missing in start mode', () => {
    makeInputs({ profile: '' })
    expect(() => new Config()).toThrow(ModeError)
  })

  it('throws when label is missing in stop mode', () => {
    makeInputs({ mode: 'stop', label: '' })
    expect(() => new Config()).toThrow(ModeError)
  })

  it('throws for invalid mode', () => {
    makeInputs({ mode: 'invalid' })
    expect(() => new Config()).toThrow(ModeError)
  })
})
