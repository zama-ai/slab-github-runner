const slab = require('./slab')
const config = require('./config')
const core = require('@actions/core')
const { waitForRunnerRegistered } = require('./gh')

function setOutput(label) {
  core.setOutput('label', label)
}

// This variable should only be defined for cleanup purpose.
let runnerName

async function cleanup() {
  if (runnerName) {
    core.info('Stop instance after cancellation')
    await slab.stopInstanceRequest(runnerName)
  }
}

process.on('SIGINT', async function () {
  await cleanup()
  process.exit()
})

async function start() {
  const provider = config.input.backend

  let startInstanceResponse

  for (let i = 1; i <= 3; i++) {
    try {
      startInstanceResponse = await slab.startInstanceRequest()
      runnerName = startInstanceResponse.runner_name
      break
    } catch (error) {
      core.info('Retrying request now...')
    }

    if (i === 3) {
      core.setFailed(
        `${provider} instance start request has failed after 3 attempts`
      )
    }
  }

  setOutput(startInstanceResponse.runner_name)

  core.info(
    `${provider} instance details: ${JSON.stringify(
      startInstanceResponse.details
    )}`
  )

  try {
    const waitInstanceResponse = await slab.waitForInstance(
      startInstanceResponse.task_id,
      'start'
    )

    const instanceId = waitInstanceResponse.start.instance_id
    core.info(`${provider} instance started with ID: ${instanceId}`)

    await waitForRunnerRegistered(startInstanceResponse.runner_name)
  } catch (error) {
    core.info(`Clean up after error, stop ${provider} instance`)
    await slab.stopInstanceRequest(startInstanceResponse.runner_name)
    core.setFailed(`${provider} instance start has failed`)
  }
}

async function stop() {
  let stopInstanceResponse

  for (let i = 1; i <= 3; i++) {
    try {
      stopInstanceResponse = await slab.stopInstanceRequest(config.input.label)
      break
    } catch (error) {
      core.info('Retrying request now...')
    }

    if (i === 3) {
      core.setFailed('Instance stop request has failed after 3 attempts')
    }
  }

  await slab.waitForInstance(stopInstanceResponse.task_id, 'stop')

  core.info('Instance successfully stopped')
}

async function run() {
  try {
    config.input.mode === 'start' ? await start() : await stop()
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
