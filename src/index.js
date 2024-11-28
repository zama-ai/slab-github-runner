const slab = require('./slab')
const config = require('./config')
const core = require('@actions/core')
const { waitForRunnerRegistered } = require('./gh')

function setOutput(label, id) {
  core.setOutput('label', label)
  core.setOutput('id', id)
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

  const runner_id = await waitForRunnerRegistered(
    start_instance_response.runner_name
  )

  setOutput(start_instance_response.runner_name, runner_id)
}

async function stop() {
  const stop_instance_response = await slab.terminateInstanceRequest(
    config.input.runnerId
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
