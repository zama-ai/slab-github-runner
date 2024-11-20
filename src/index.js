const slab = require('./slab')
const config = require('./config')
const core = require('@actions/core')
const { waitForRunnerRegistered } = require('./gh')

function setOutput(label) {
  core.setOutput('label', label)
}

async function start() {
  const start_instance_response = await slab.startInstanceRequest()
  const wait_instance_response = await slab.waitForInstance(
    start_instance_response.task_id,
    'start'
  )

  const provider = config.input.backend
  const instance_id = wait_instance_response.start.instance_id
  core.info(`${provider} instance started with ID: ${instance_id}`)

  setOutput(start_instance_response.runner_name)

  await waitForRunnerRegistered(start_instance_response.runner_name)
}

async function stop() {
  const stop_instance_response = await slab.terminateInstanceRequest(
    config.input.label
  )
  await slab.waitForInstance(stop_instance_response.task_id, 'stop')

  core.info('Instance successfully terminated')
}

async function run() {
  try {
    config.input.mode === 'start' ? await start() : await stop()
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
