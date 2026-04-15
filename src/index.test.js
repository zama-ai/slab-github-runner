jest.mock('./config', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('./slab', () => ({
  __esModule: true,
  default: {
    startInstanceRequest: jest.fn(),
    stopInstanceRequest: jest.fn(),
    waitForGithub: jest.fn(),
    waitForInstance: jest.fn()
  }
}))
jest.mock('./gh', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  setFailed: jest.fn(),
  setOutput: jest.fn()
}))

const flushPromises = () => new Promise(resolve => setImmediate(resolve))

beforeEach(() => {
  jest.resetModules()
})

function getCoreMock() {
  return require('@actions/core')
}

function getSlabMock() {
  return require('./slab').default
}

function getGhMock() {
  return require('./gh').default
}

function getConfigMock() {
  return require('./config').default
}

function setupStartConfig(Config) {
  Config.mockImplementation(() => ({
    input: { mode: 'start', backend: 'aws', profile: 'test', label: '' }
  }))
}

function setupStopConfig(Config) {
  Config.mockImplementation(() => ({
    input: { mode: 'stop', backend: 'aws', label: 'runner-1' }
  }))
}

describe('start flow', () => {
  it('sets label output and does not fail on full success', async () => {
    const Config = getConfigMock()
    setupStartConfig(Config)
    const slabMock = getSlabMock()
    slabMock.startInstanceRequest.mockResolvedValue({ task_id: 'task-1' })
    slabMock.waitForGithub.mockResolvedValue({
      configuration_fetching: {
        runner_name: 'runner-1',
        details: 'some details'
      }
    })
    slabMock.waitForInstance.mockResolvedValue({
      start: { instance_id: 'i-123' }
    })
    getGhMock().mockResolvedValue(undefined)
    const core = getCoreMock()

    require('./index')
    await flushPromises()

    expect(core.setOutput).toHaveBeenCalledWith('label', 'runner-1')
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('retries on first failure and succeeds on second attempt', async () => {
    const Config = getConfigMock()
    setupStartConfig(Config)
    const slabMock = getSlabMock()
    slabMock.startInstanceRequest
      .mockRejectedValueOnce(new Error('first failure'))
      .mockResolvedValue({ task_id: 'task-1' })
    slabMock.waitForGithub.mockResolvedValue({
      configuration_fetching: { runner_name: 'runner-1', details: '' }
    })
    slabMock.waitForInstance.mockResolvedValue({
      start: { instance_id: 'i-123' }
    })
    getGhMock().mockResolvedValue(undefined)
    const core = getCoreMock()

    require('./index')
    await flushPromises()

    expect(core.info).toHaveBeenCalledWith('Retrying request now...')
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('calls setFailed after all 3 attempts fail', async () => {
    const Config = getConfigMock()
    setupStartConfig(Config)
    const slabMock = getSlabMock()
    slabMock.startInstanceRequest.mockRejectedValue(new Error('always fails'))
    const core = getCoreMock()

    require('./index')
    await flushPromises()

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('failed after 3 attempts')
    )
  })

  it('stops instance for cleanup and calls setFailed when waitForInstance throws', async () => {
    const Config = getConfigMock()
    setupStartConfig(Config)
    const slabMock = getSlabMock()
    slabMock.startInstanceRequest.mockResolvedValue({ task_id: 'task-1' })
    slabMock.waitForGithub.mockResolvedValue({
      configuration_fetching: { runner_name: 'runner-1', details: '' }
    })
    slabMock.waitForInstance.mockRejectedValue(new Error('instance error'))
    slabMock.stopInstanceRequest.mockResolvedValue({})
    const core = getCoreMock()

    require('./index')
    await flushPromises()

    expect(slabMock.stopInstanceRequest).toHaveBeenCalled()
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('instance start has failed')
    )
  })
})

describe('stop flow', () => {
  it('logs success message on full success', async () => {
    const Config = getConfigMock()
    setupStopConfig(Config)
    const slabMock = getSlabMock()
    slabMock.stopInstanceRequest.mockResolvedValue({ task_id: 'task-1' })
    slabMock.waitForGithub.mockResolvedValue({
      runner_unregister: { status: 'done' }
    })
    slabMock.waitForInstance.mockResolvedValue({})
    const core = getCoreMock()

    require('./index')
    await flushPromises()

    expect(core.info).toHaveBeenCalledWith('Instance successfully stopped')
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('calls setFailed after all 3 stop attempts fail', async () => {
    const Config = getConfigMock()
    setupStopConfig(Config)
    const slabMock = getSlabMock()
    slabMock.stopInstanceRequest.mockRejectedValue(new Error('always fails'))
    const core = getCoreMock()

    require('./index')
    await flushPromises()

    expect(core.setFailed).toHaveBeenCalledWith(
      'Instance stop request has failed after 3 attempts'
    )
  })

  it('warns and continues when waitForGithub throws', async () => {
    const Config = getConfigMock()
    setupStopConfig(Config)
    const slabMock = getSlabMock()
    slabMock.stopInstanceRequest.mockResolvedValue({ task_id: 'task-1' })
    slabMock.waitForGithub.mockRejectedValue(new Error('github error'))
    slabMock.waitForInstance.mockResolvedValue({})
    const core = getCoreMock()

    require('./index')
    await flushPromises()

    expect(core.warning).toHaveBeenCalledWith(
      'An error occurred while unregistering runner, check job logs'
    )
    expect(core.info).toHaveBeenCalledWith('Instance successfully stopped')
  })

  it('calls setFailed when waitForInstance throws', async () => {
    const Config = getConfigMock()
    setupStopConfig(Config)
    const slabMock = getSlabMock()
    slabMock.stopInstanceRequest.mockResolvedValue({ task_id: 'task-1' })
    slabMock.waitForGithub.mockResolvedValue({
      runner_unregister: { status: 'done' }
    })
    slabMock.waitForInstance.mockRejectedValue(new Error('stop failed'))
    const core = getCoreMock()

    require('./index')
    await flushPromises()

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('zombie instance')
    )
  })
})

describe('run', () => {
  it('calls setFailed when Config constructor throws', async () => {
    const Config = getConfigMock()
    Config.mockImplementation(() => {
      throw new Error('config error')
    })
    const core = getCoreMock()

    require('./index')
    await flushPromises()

    expect(core.setFailed).toHaveBeenCalledWith('config error')
  })
})
