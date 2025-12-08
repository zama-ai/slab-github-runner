const slab = require('./slab')
const config = require('./config')
const core = require('@actions/core')
const { waitForRunnerRegistered } = require('./gh')

function setOutput(label) {
  core.setOutput('label', label)
}

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
  let waitGithubResponse

  for (let i = 1; i <= 3; i++) {
    try {
      startInstanceResponse = await slab.startInstanceRequest()
      waitGithubResponse = await slab.waitForGithub(
        startInstanceResponse.task_id,
        'configuration_fetching'
      )
      break
    } catch (error) {
      core.info('Retrying request now...')
    }

    if (i === 3) {
      core.setFailed(
        `${provider} instance start request has failed after 3 attempts (reason: configuration fetching has failed)`
      )
      return
    }
  }

  runnerName = waitGithubResponse.configuration_fetching.runner_name
  setOutput(runnerName)

  core.info(
    `${provider} instance details: ${waitGithubResponse.configuration_fetching.details}`
  )

  try {
    const waitInstanceResponse = await slab.waitForInstance(
      startInstanceResponse.task_id,
      'start'
    )

    const instanceId = waitInstanceResponse.start.instance_id
    core.info(`${provider} instance started with ID: ${instanceId}`)

    await waitForRunnerRegistered(runnerName)
  } catch (error) {
    core.info(`Clean up after error, stop ${provider} instance`)
    await slab.stopInstanceRequest(runnerName)
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
      return
    }
  }

  try {
    const waitGithubResponse = await slab.waitForGithub(
      stopInstanceResponse.task_id,
      'runner_unregister'
    )
    const taskStatus = waitGithubResponse.runner_unregister.status.toLowerCase()
    if (taskStatus === 'done') {
      core.info(
        `Runner ${config.input.label} unregistered from GitHub successfully`
      )
    }
  } catch (error) {
    // Unregistration failure is not critical, so we just log it and continue.
    core.warning('An error occurred while unregistering runner, check job logs')
  }

  try {
    await slab.waitForInstance(stopInstanceResponse.task_id, 'stop')
    core.info('Instance successfully stopped')
  } catch (error) {
    // Unregistration failure is not critical, so we just log it and continue.
    core.setFailed(
      'An error occurred while stopping instance, check for zombie instance in backend provider console.'
    )
  }
}

async function run() {
  try {
    config.input.mode === 'start' ? await start() : await stop()
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
