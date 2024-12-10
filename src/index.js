const slab = require('./slab')
const config = require('./config')
const core = require('@actions/core')
const { waitForRunnerRegistered } = require('./gh')
const utils = require('./utils')

function setOutput(label) {
  core.setOutput('label', label)
}

// This variable should only be defined for cleanup purpose.
let runner_name

async function cleanup() {
  if (runner_name) {
    core.info('Stop instance after cancellation')
    await slab.stopInstanceRequest(runner_name)
  }
}

process.on('SIGINT', async function () {
  await cleanup()
  process.exit()
})

async function start() {
  const provider = config.input.backend

  let start_instance_response

  for (let i = 1; i <= 3; i++) {
    try {
      start_instance_response = await slab.startInstanceRequest()
      runner_name = start_instance_response.runner_name
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

  setOutput(start_instance_response.runner_name)

  core.info(
    `${provider} instance details: ${JSON.stringify(
      start_instance_response.details
    )}`
  )

  try {
    const wait_instance_response = await slab.waitForInstance(
      start_instance_response.task_id,
      'start'
    )

    const instance_id = wait_instance_response.start.instance_id
    core.info(`${provider} instance started with ID: ${instance_id}`)

    await waitForRunnerRegistered(start_instance_response.runner_name)
  } catch (error) {
    core.info(`Clean up after error, stop ${provider} instance`)
    await slab.stopInstanceRequest(start_instance_response.runner_name)
  }
}

async function stop() {
  let stop_instance_response

  for (let i = 1; i <= 3; i++) {
    try {
      stop_instance_response = await slab.stopInstanceRequest(
        config.input.label
      )
      break
    } catch (error) {
      core.info('Retrying request now...')
    }

    if (i === 3) {
      core.setFailed(`Instance stop request has failed after 3 attempts`)
    }
  }

  await slab.waitForInstance(stop_instance_response.task_id, 'stop')

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
