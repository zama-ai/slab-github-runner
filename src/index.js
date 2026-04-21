/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "^_" }] */
import slab from './slab'
import {
  info as setInfo,
  setFailed,
  setOutput as coreSetOutput,
  warning as setWarning
} from '@actions/core'
import waitForRunnerRegistered from './gh'
import Config from './config'

function setOutput(label) {
  coreSetOutput('label', label)
}

let runnerName

async function cleanup() {
  if (runnerName) {
    setInfo('Stop instance after cancellation')
    await slab.stopInstanceRequest(runnerName)
  }
}

process.on('SIGINT', async () => {
  await cleanup()
  process.exit()
})

async function start(config) {
  const provider = config.input.backend

  let startInstanceResponse
  let waitGithubResponse

  for (let i = 1; i <= 3; i++) {
    try {
      startInstanceResponse = await slab.startInstanceRequest(config)
      waitGithubResponse = await slab.waitForGithub(
        config,
        startInstanceResponse.task_id,
        'configuration_fetching'
      )
      break
    } catch {
      setInfo('Retrying request now...')
    }

    if (i === 3) {
      setFailed(
        `${provider} instance start request has failed after 3 attempts (reason: configuration fetching has failed)`
      )
      return
    }
  }

  runnerName = waitGithubResponse.configuration_fetching.runner_name
  setOutput(runnerName)

  setInfo(
    `${provider} instance details: ${waitGithubResponse.configuration_fetching.details}`
  )

  try {
    const waitInstanceResponse = await slab.waitForInstance(
      config,
      startInstanceResponse.task_id,
      'start'
    )

    const instanceId = waitInstanceResponse.start.instance_id
    setInfo(`${provider} instance started with ID: ${instanceId}`)

    await waitForRunnerRegistered(config, runnerName)
  } catch {
    setInfo(`Clean up after error, stop ${provider} instance`)
    await slab.stopInstanceRequest(config, runnerName)
    setFailed(`${provider} instance start has failed`)
  }
}

async function stop(config) {
  let stopInstanceResponse

  for (let i = 1; i <= 3; i++) {
    try {
      stopInstanceResponse = await slab.stopInstanceRequest(
        config,
        config.input.label
      )
      break
    } catch {
      setInfo('Retrying request now...')
    }

    if (i === 3) {
      setFailed('Instance stop request has failed after 3 attempts')
      return
    }
  }

  try {
    const waitGithubResponse = await slab.waitForGithub(
      config,
      stopInstanceResponse.task_id,
      'runner_unregister'
    )
    const taskStatus = waitGithubResponse.runner_unregister.status.toLowerCase()
    if (taskStatus === 'done') {
      setInfo(
        `Runner ${config.input.label} unregistered from GitHub successfully`
      )
    }
  } catch {
    // Unregistration failure is not critical, so we just log it and continue.
    setWarning('An error occurred while unregistering runner, check job logs')
  }

  try {
    await slab.waitForInstance(config, stopInstanceResponse.task_id, 'stop')
    setInfo('Instance successfully stopped')
  } catch {
    // Unregistration failure is not critical, so we just log it and continue.
    setFailed(
      'An error occurred while stopping instance, check for zombie instance in backend provider console.'
    )
  }
}

async function run() {
  try {
    const config = new Config()

    config.input.mode === 'start' ? await start(config) : await stop(config)
  } catch (error) {
    setFailed(error.message)
  }
}

run()
