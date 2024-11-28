const core = require('@actions/core')
const github = require('@actions/github')
const _ = require('lodash')
const config = require('./config')
const utils = require('./utils')

// Use the unique label to find the runner as we don't have the runner's id,
// it's not possible to get it in any other way.
async function getRunner(label) {
  const octokit = github.getOctokit(config.input.githubToken)

  try {
    const runners = await octokit.paginate(
      'GET /repos/{owner}/{repo}/actions/runners',
      {
        owner: config.githubContext.owner,
        repo: config.githubContext.repo
      }
    )
    const foundRunners = _.filter(runners, { name: label })
    return foundRunners.length > 0 ? foundRunners[0] : null
  } catch (error) {
    return null
  }
}

async function waitForRunnerRegistered(label) {
  const timeoutSeconds = 1800
  const retryIntervalSeconds = 10
  const quietPeriodSeconds = 30
  let waitSeconds = 0

  core.info(
    `Waiting ${quietPeriodSeconds}s for ${config.input.backend} instance to be registered in GitHub as a new self-hosted runner`
  )
  await utils.sleep(quietPeriodSeconds)
  core.info(
    `Checking every ${retryIntervalSeconds}s if the GitHub self-hosted runner is registered (runner: ${label})`
  )

  while (waitSeconds < timeoutSeconds) {
    const runner = await getRunner(label)

    if (runner && runner.status === 'online') {
      core.info(
        `GitHub self-hosted runner ${runner.name} is registered and ready to use`
      )
      return runner.id
    } else {
      waitSeconds += retryIntervalSeconds
      core.info('Checking...')
    }

    await utils.sleep(retryIntervalSeconds)
  }

  core.error(
    `A timeout of ${timeoutSeconds} seconds is exceeded. Your ${config.input.backend} instance was not able to register itself in GitHub as a new self-hosted runner.`
  )
  throw new Error('GitHub self-hosted runner registration error')
}

module.exports = {
  waitForRunnerRegistered
}
