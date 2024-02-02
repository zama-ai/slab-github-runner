const core = require('@actions/core')
const github = require('@actions/github')
const _ = require('lodash')
const config = require('./config')
const utils = require('./utils')

// Use the unique label to find the runner as we don't have the runner's id,
// it's not possible to get it in any other way.
async function getRunner(label) {
  core.debug(`getting runners for label: ${label}`)
  const octokit = github.getOctokit(config.input.githubToken)

  try {
    const runners = await octokit.paginate(
      'GET /repos/{owner}/{repo}/actions/runners',
      {
        owner: config.githubContext.owner,
        repo: config.githubContext.repo
      }
    )
    core.debug(runners)
    const foundRunners = _.filter(runners, { labels: [{ name: label }] })
    core.debug(foundRunners)
    return foundRunners.length > 0 ? foundRunners[0] : null
  } catch (error) {
    core.debug(error)
    return null
  }
}

async function waitForRunnerRegistered(label) {
  const timeoutSeconds = 300
  const retryIntervalSeconds = 10
  const quietPeriodSeconds = 30
  let waitSeconds = 0

  core.info(
    `Waiting ${quietPeriodSeconds}s for the AWS EC2 instance to be registered in GitHub as a new self-hosted runner`
  )
  await utils.sleep(quietPeriodSeconds)
  core.info(
    `Checking every ${retryIntervalSeconds}s if the GitHub self-hosted runner is registered`
  )

  while (waitSeconds < timeoutSeconds) {
    const runner = await getRunner(label)
    core.debug(runner)

    if (runner && runner.status === 'online') {
      core.info(
        `GitHub self-hosted runner ${runner.name} is registered and ready to use`
      )
      return
    } else {
      waitSeconds += retryIntervalSeconds
      core.info('Checking...')
    }

    await utils.sleep(retryIntervalSeconds)
  }

  core.error(
    `A timeout of ${timeoutSeconds} minutes is exceeded. Your AWS EC2 instance was not able to register itself in GitHub as a new self-hosted runner.`
  )
  throw new Error('GitHub self-hosted runner registration error')
}

module.exports = {
  waitForRunnerRegistered
}
