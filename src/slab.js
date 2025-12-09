const crypto = require('node:crypto')
const core = require('@actions/core')
const config = require('./config')
const utils = require('./utils')

function getSignature(content) {
  const hmac = crypto.createHmac('sha256', config.input.jobSecret)
  hmac.update(content)
  return hmac.digest('hex')
}

function concatPath(url, path) {
  if (url.endsWith('/')) {
    // Multiple '/' char at the end of URL is fine.
    return url.concat(path)
  } else {
    return url.concat('/', path)
  }
}

async function startInstanceRequest() {
  const url = config.input.slabUrl
  const provider = config.input.backend

  const details = {
    backend: {
      provider,
      profile: config.input.profile,
      create_watchdog_task: true
    }
  }

  const payload = {
    details,
    sha: config.githubContext.sha,
    git_ref: config.githubContext.ref
  }

  const body = JSON.stringify(payload)
  const signature = getSignature(body)
  let response

  core.info(`Request ${provider} instance start`)

  try {
    response = await fetch(concatPath(url, 'job'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Slab-Repository': `${config.githubContext.owner}/${config.githubContext.repo}`,
        'X-Slab-Command': 'start_instance_v2',
        'X-Hub-Signature-256': `sha256=${signature}`
      },
      body: body.toString()
    })
  } catch (error) {
    core.error('Fetch call has failed')
    throw error
  }

  if (response.ok) {
    core.info(`${provider} instance start successfully requested`)
    return await response.json()
  } else {
    const respBody = await response.text()
    core.error(
      `${provider} instance start request has failed (HTTP status code: ${response.status}, body: ${respBody})`
    )
    throw new Error('instance start request failed')
  }
}

async function stopInstanceRequest(runnerName) {
  const url = config.input.slabUrl

  const payload = {
    runner_name: runnerName,
    sha: config.githubContext.sha,
    git_ref: config.githubContext.ref
  }

  const body = JSON.stringify(payload)
  const signature = getSignature(body)
  let response

  core.info(`Request instance stop (runner: ${runnerName})`)

  try {
    response = await fetch(concatPath(url, 'job'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Slab-Repository': `${config.githubContext.owner}/${config.githubContext.repo}`,
        'X-Slab-Command': 'stop_instance',
        'X-Hub-Signature-256': `sha256=${signature}`
      },
      body: body.toString()
    })
  } catch (error) {
    core.error('Instance stop request has failed')
    throw error
  }

  if (response.ok) {
    core.info('Instance stop successfully requested')
    return response.json()
  } else {
    const respBody = await response.text()
    core.error(
      `Instance stop request has failed (HTTP status code: ${response.status}, body: ${respBody})`
    )
    throw new Error('instance stop request failed')
  }
}

async function waitForGithub(taskId, taskName) {
  core.info(`Wait for GitHub on ${taskName} (task ID: ${taskId})`)

  const routeRootPath = 'github_task'

  // while (true) equivalent to please ESLint
  for (;;) {
    await utils.sleep(15)

    core.info('Checking...')
    const response = await getTask(routeRootPath, taskId)

    if (response.ok) {
      const body = await response.json()
      const taskStatus = body[taskName].status.toLowerCase()

      if (taskStatus === 'done') {
        return body
      } else if (taskStatus === 'failed') {
        if (taskName === 'runner_unregister') {
          core.warning(
            `Github runner ${body[taskName].details.runner_name} unregistration failed.`
          )
          return body
        } else {
          core.error(`GitHub task failed (details: ${body[taskName].details})`)
          core.error('Failure occurred while waiting for GitHub.')
          throw new Error('github task reports failure')
        }
      }
    } else {
      core.error(
        `Failed to wait for GitHub task (HTTP status code: ${response.status})`
      )
      throw new Error('github waiting failed')
    }
  }
}

async function waitForInstance(taskId, taskName) {
  core.info(`Wait for instance to ${taskName} (task ID: ${taskId})`)

  const routeRootPath = 'backend_task'

  // while (true) equivalent to please ESLint
  for (;;) {
    await utils.sleep(15)

    core.info('Checking...')
    const response = await getTask(routeRootPath, taskId)

    if (response.ok) {
      const body = await response.json()
      const taskStatus = body[taskName].status.toLowerCase()

      if (taskStatus === 'done') {
        if (taskName === 'start') {
          await acknowledgeTaskDone(taskId)
        }
        return body
      } else if (taskStatus === 'failed') {
        core.error(`Instance task failed (details: ${body[taskName].details})`)
        core.error('Failure occurred while waiting for instance.')
        throw new Error('instance task reports failure')
      }
    } else {
      core.error(
        `Failed to wait for instance (HTTP status code: ${response.status})`
      )
      throw new Error('instance waiting failed')
    }
  }
}

async function getTask(routeRootPath, taskId) {
  const url = config.input.slabUrl
  const route = `${routeRootPath}/${config.githubContext.repo}/${taskId}`
  let response

  try {
    response = await fetch(concatPath(url, route))
  } catch (error) {
    core.error(`Failed to fetch task status with ID: ${taskId}`)
    throw error
  }

  if (response.ok) {
    core.debug('Instance task successfully fetched')
    return response
  } else {
    core.error(
      `Instance task status request has failed (ID: ${taskId}, HTTP status code: ${response.status})`
    )
    throw new Error('task fetching failed')
  }
}

async function acknowledgeTaskDone(taskId) {
  const url = config.input.slabUrl
  const route = `backend_task_ack_done/${config.githubContext.repo}/${taskId}`
  let response

  try {
    response = await fetch(concatPath(url, route), {
      method: 'POST'
    })
  } catch (error) {
    core.error(`Failed to acknowledge task done with ID: ${taskId}`)
    throw error
  }

  if (response.ok) {
    core.debug('Instance task successfully acknowledged')
    return response
  } else {
    core.error(
      `Instance task acknowledgment request has failed (ID: ${taskId}, HTTP status code: ${response.status})`
    )
    throw new Error('task acknowledging failed')
  }
}

module.exports = {
  startInstanceRequest,
  stopInstanceRequest,
  waitForGithub,
  waitForInstance
}
