const slab = require('./slab')
const config = require('./config')
const core = require('@actions/core')
const { waitForRunnerRegistered } = require('./gh')

function setOutput(label, ec2InstanceId) {
  core.setOutput('label', label)
  core.setOutput('ec2-instance-id', ec2InstanceId)
}

async function start() {
  const start_instance_response = await slab.startInstanceRequest()
  const wait_instance_response = await slab.waitForInstance(
    start_instance_response.task_id,
    'Start'
  )

  setOutput(
    start_instance_response.runner_name,
    wait_instance_response.instance_id
  )

  await waitForRunnerRegistered(start_instance_response.runner_name)
}

async function stop() {
  const stop_instance_response = await slab.terminateInstanceRequest(
    config.input.label
  )
  await slab.waitForInstance(stop_instance_response.task_id, 'Stop')
}

async function run() {
  try {
    config.input.mode === 'start' ? await start() : await stop()
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
