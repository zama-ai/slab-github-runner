import crypto from 'node:crypto'
import { error as setError, warning as setWarning } from '@actions/core'
import utils from './utils'
import slab from './slab'

jest.mock('@actions/core', () => ({
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}))
jest.mock('./utils', () => ({
  __esModule: true,
  default: { sleep: jest.fn().mockResolvedValue(undefined) }
}))

afterEach(() => {
  jest.restoreAllMocks()
})

const mockConfig = {
  input: {
    slabUrl: 'http://slab.test',
    jobSecret: 'test-secret',
    backend: 'aws',
    profile: 'test-profile'
  },
  githubContext: {
    owner: 'test-owner',
    repo: 'test-repo',
    sha: 'test-sha',
    ref: 'refs/heads/main'
  }
}

function makeOkResponse(body) {
  return { ok: true, json: jest.fn().mockResolvedValue(body) }
}

function makeErrorResponse(status, text) {
  return { ok: false, status, text: jest.fn().mockResolvedValue(text) }
}

describe('startInstanceRequest', () => {
  it('returns parsed JSON body on success', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(makeOkResponse({ task_id: '123' }))
    const result = await slab.startInstanceRequest(mockConfig)
    expect(result).toEqual({ task_id: '123' })
  })

  it('throws and calls setError on network failure', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    await expect(slab.startInstanceRequest(mockConfig)).rejects.toThrow(
      'network down'
    )
    expect(setError).toHaveBeenCalledWith('Fetch call has failed')
  })

  it('throws and calls setError on HTTP error response', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(makeErrorResponse(500, 'server error'))
    await expect(slab.startInstanceRequest(mockConfig)).rejects.toThrow(
      'instance start request failed'
    )
    expect(setError).toHaveBeenCalledWith(expect.stringContaining('500'))
  })

  it('calls correct URL when slabUrl has trailing slash', async () => {
    const configWithSlash = Object.assign({}, mockConfig, {
      input: Object.assign({}, mockConfig.input, {
        slabUrl: 'http://slab.test/'
      })
    })
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(makeOkResponse({ task_id: '1' }))
    await slab.startInstanceRequest(configWithSlash)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://slab.test/job',
      expect.anything()
    )
  })

  it('calls correct URL when slabUrl has no trailing slash', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(makeOkResponse({ task_id: '1' }))
    await slab.startInstanceRequest(mockConfig)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://slab.test/job',
      expect.anything()
    )
  })

  it('sends correct request headers', async () => {
    let capturedOptions
    jest.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => {
      capturedOptions = options
      return Promise.resolve(makeOkResponse({ task_id: '1' }))
    })
    await slab.startInstanceRequest(mockConfig)
    expect(capturedOptions.headers['X-Slab-Command']).toBe('start_instance_v2')
    expect(capturedOptions.headers['X-Slab-Repository']).toBe(
      'test-owner/test-repo'
    )
    expect(capturedOptions.headers['X-Hub-Signature-256']).toMatch(/^sha256=/)
  })

  it('sends correct request body fields', async () => {
    let capturedOptions
    jest.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => {
      capturedOptions = options
      return Promise.resolve(makeOkResponse({ task_id: '1' }))
    })
    await slab.startInstanceRequest(mockConfig)
    const body = JSON.parse(capturedOptions.body)
    expect(body.details.backend.provider).toBe('aws')
    expect(body.details.backend.profile).toBe('test-profile')
    expect(body.sha).toBe('test-sha')
    expect(body.git_ref).toBe('refs/heads/main')
  })

  it('computes HMAC signature correctly', async () => {
    let capturedOptions
    jest.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => {
      capturedOptions = options
      return Promise.resolve(makeOkResponse({ task_id: '1' }))
    })
    await slab.startInstanceRequest(mockConfig)
    const expectedSig = crypto
      .createHmac('sha256', mockConfig.input.jobSecret)
      .update(capturedOptions.body)
      .digest('hex')
    expect(capturedOptions.headers['X-Hub-Signature-256']).toBe(
      `sha256=${expectedSig}`
    )
  })
})

describe('stopInstanceRequest', () => {
  it('returns parsed JSON body on success', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(makeOkResponse({ task_id: '456' }))
    const result = await slab.stopInstanceRequest(mockConfig, 'runner-1')
    expect(result).toEqual({ task_id: '456' })
  })

  it('sends stop_instance command header', async () => {
    let capturedOptions
    jest.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => {
      capturedOptions = options
      return Promise.resolve(makeOkResponse({ task_id: '1' }))
    })
    await slab.stopInstanceRequest(mockConfig, 'runner-1')
    expect(capturedOptions.headers['X-Slab-Command']).toBe('stop_instance')
  })

  it('throws and calls setError on network failure', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    await expect(
      slab.stopInstanceRequest(mockConfig, 'runner-1')
    ).rejects.toThrow('network down')
    expect(setError).toHaveBeenCalledWith('Instance stop request has failed')
  })

  it('throws and calls setError on HTTP error response', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(makeErrorResponse(500, 'server error'))
    await expect(
      slab.stopInstanceRequest(mockConfig, 'runner-1')
    ).rejects.toThrow('instance stop request failed')
    expect(setError).toHaveBeenCalledWith(expect.stringContaining('500'))
  })
})

describe('waitForGithub', () => {
  it('returns body immediately when task is done', async () => {
    const body = {
      configuration_fetching: {
        status: 'done',
        runner_name: 'runner-1',
        details: 'ok'
      }
    }
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(makeOkResponse(body))
    const result = await slab.waitForGithub(
      mockConfig,
      'task-1',
      'configuration_fetching'
    )
    expect(result).toEqual(body)
  })

  it('polls until task is done', async () => {
    const pendingBody = { configuration_fetching: { status: 'pending' } }
    const doneBody = {
      configuration_fetching: { status: 'done', runner_name: 'r', details: '' }
    }
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeOkResponse(pendingBody))
      .mockResolvedValueOnce(makeOkResponse(pendingBody))
      .mockResolvedValue(makeOkResponse(doneBody))
    const result = await slab.waitForGithub(
      mockConfig,
      'task-1',
      'configuration_fetching'
    )
    expect(result).toEqual(doneBody)
    expect(utils.sleep).toHaveBeenCalledTimes(3)
  })

  it('returns body and warns when runner_unregister fails', async () => {
    const body = {
      runner_unregister: {
        status: 'failed',
        details: { runner_name: 'runner-1' }
      }
    }
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(makeOkResponse(body))
    const result = await slab.waitForGithub(
      mockConfig,
      'task-1',
      'runner_unregister'
    )
    expect(result).toEqual(body)
    expect(setWarning).toHaveBeenCalledWith(
      expect.stringContaining('unregistration failed')
    )
  })

  it('throws when non-unregister task fails', async () => {
    const body = {
      configuration_fetching: { status: 'failed', details: 'some failure' }
    }
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(makeOkResponse(body))
    await expect(
      slab.waitForGithub(mockConfig, 'task-1', 'configuration_fetching')
    ).rejects.toThrow('github task reports failure')
  })

  it('propagates error when fetch throws', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('network error'))
    await expect(
      slab.waitForGithub(mockConfig, 'task-1', 'configuration_fetching')
    ).rejects.toThrow('network error')
  })

  it('throws task fetching failed when getTask receives non-ok response', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: false, status: 404 })
    await expect(
      slab.waitForGithub(mockConfig, 'task-1', 'configuration_fetching')
    ).rejects.toThrow('task fetching failed')
  })
})

describe('waitForInstance', () => {
  it('calls ack and returns body when start task is done', async () => {
    const taskBody = {
      start: { status: 'done', instance_id: 'i-123', details: '' }
    }
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeOkResponse(taskBody))
      .mockResolvedValueOnce({ ok: true })
    const result = await slab.waitForInstance(mockConfig, 'task-1', 'start')
    expect(result).toEqual(taskBody)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('backend_task_ack_done'),
      expect.anything()
    )
  })

  it('returns body without ack when stop task is done', async () => {
    const taskBody = { stop: { status: 'done', details: '' } }
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(makeOkResponse(taskBody))
    const result = await slab.waitForInstance(mockConfig, 'task-1', 'stop')
    expect(result).toEqual(taskBody)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws when task fails', async () => {
    const body = { start: { status: 'failed', details: 'error' } }
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(makeOkResponse(body))
    await expect(
      slab.waitForInstance(mockConfig, 'task-1', 'start')
    ).rejects.toThrow('instance task reports failure')
  })

  it('polls until task is done', async () => {
    const pendingBody = { stop: { status: 'pending' } }
    const doneBody = { stop: { status: 'done', details: '' } }
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeOkResponse(pendingBody))
      .mockResolvedValueOnce(makeOkResponse(pendingBody))
      .mockResolvedValue(makeOkResponse(doneBody))
    const result = await slab.waitForInstance(mockConfig, 'task-1', 'stop')
    expect(result).toEqual(doneBody)
    expect(utils.sleep).toHaveBeenCalledTimes(3)
  })

  it('propagates error when fetch throws', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('network error'))
    await expect(
      slab.waitForInstance(mockConfig, 'task-1', 'stop')
    ).rejects.toThrow('network error')
  })

  it('throws when ack fetch rejects', async () => {
    const taskBody = {
      start: { status: 'done', instance_id: 'i-123', details: '' }
    }
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeOkResponse(taskBody))
      .mockRejectedValue(new Error('ack network error'))
    await expect(
      slab.waitForInstance(mockConfig, 'task-1', 'start')
    ).rejects.toThrow('ack network error')
  })

  it('throws when ack returns non-ok response', async () => {
    const taskBody = {
      start: { status: 'done', instance_id: 'i-123', details: '' }
    }
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeOkResponse(taskBody))
      .mockResolvedValue({ ok: false, status: 500 })
    await expect(
      slab.waitForInstance(mockConfig, 'task-1', 'start')
    ).rejects.toThrow('task acknowledging failed')
  })
})
