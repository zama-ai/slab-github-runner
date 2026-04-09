import {
  error as setError,
  info as setInfo,
  debug as setDebug
} from '@actions/core'
import { getOctokit } from '@actions/github'
import _ from 'lodash'
import utils from './utils'

// Use the unique label to find the runner as we don't have the runner's id,
// it's not possible to get it in any other way.
async function getRunner(config, label) {
  const octokit = getOctokit(config.input.githubToken)
  let runners = []

  try {
    runners = await octokit.paginate(
      'GET /repos/{owner}/{repo}/actions/runners',
      {
        owner: config.githubContext.owner,
        repo: config.githubContext.repo
      }
    )
  } catch (error) {
    setError(`Failed to fetch runners: ${error.message}`)
    return null
  }

  const foundRunners = _.filter(runners, { name: label })
  return foundRunners.length > 0 ? foundRunners[0] : null
}

async function waitForRunnerRegistered(config, label) {
  const timeoutSeconds = 1800
  const quietPeriodSeconds = 30
  let waitSeconds = 0
  let retryIntervalSeconds = 60

  setInfo(
    `Waiting ${quietPeriodSeconds}s for ${config.input.backend} instance to be registered in GitHub as a new self-hosted runner`
  )
  await utils.sleep(quietPeriodSeconds)
  setInfo(
    `Checking every ${quietPeriodSeconds}-${retryIntervalSeconds}s if the GitHub self-hosted runner is registered (runner: ${label})`
  )

  while (waitSeconds < timeoutSeconds) {
    const runner = await getRunner(config, label)

    if (runner && runner.status === 'online') {
      setInfo(
        `GitHub self-hosted runner ${runner.name} is registered and ready to use`
      )
      return
    } else {
      waitSeconds += retryIntervalSeconds
      setInfo('Checking...')
    }

    retryIntervalSeconds =
      Math.random() * (retryIntervalSeconds - quietPeriodSeconds) +
      quietPeriodSeconds // Can sleep up to 60 seconds.
    setDebug(`Sleeping for ${retryIntervalSeconds}s`)
    await utils.sleep(retryIntervalSeconds)
  }

  setError(
    `A timeout of ${timeoutSeconds} seconds is exceeded. Your ${config.input.backend} instance was not able to register itself in GitHub as a new self-hosted runner.`
  )
  throw new Error('GitHub self-hosted runner registration error')
}

export default waitForRunnerRegistered
