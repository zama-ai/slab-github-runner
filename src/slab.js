const crypto = require('node:crypto')
const core = require('@actions/core')
const config = require('./config')
const utils = require('./utils')

function getSignature(content) {
  const hmac = crypto.createHmac('sha256', config.input.jobSecret)
  hmac.update(content)
  return hmac.digest('hex')
}

function concat_path(url, path) {
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
    response = await fetch(concat_path(url, 'job'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Slab-Repository': `${config.githubContext.owner}/${config.githubContext.repo}`,
        'X-Slab-Command': 'start_instance',
        'X-Hub-Signature-256': `sha256=${signature}`
      },
      body: body.toString()
    })
  } catch (error) {
    core.error(`Fetch call has failed`)
    throw error
  }

  if (response.ok) {
    core.info(`${provider} instance start successfully requested`)
    return await response.json()
  } else {
    const resp_body = await response.text()
    core.error(
      `${provider} instance start request has failed (HTTP status code: ${response.status}, body: ${resp_body})`
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
    response = await fetch(concat_path(url, 'job'), {
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
    const resp_body = await response.text()
    core.error(
      `Instance stop request has failed (HTTP status code: ${response.status}, body: ${resp_body})`
    )
    throw new Error('instance stop request failed')
  }
}

async function waitForInstance(taskId, taskName) {
  core.info(`Wait for instance to ${taskName} (task ID: ${taskId})`)

  // while (true) equivalent to please ESLint
  for (;;) {
    await utils.sleep(15)

    core.info('Checking...')
    const response = await getTask(taskId)

    if (response.ok) {
      const body = await response.json()
      const task_status = body[taskName].status.toLowerCase()

      if (task_status === 'done') {
        if (taskName === 'start') {
          await acknowledgeTaskDone(taskId)
        }
        await removeTask(taskId)
        return body
      } else if (task_status === 'failed') {
        core.error(`Instance task failed (details: ${body[taskName].details})`)
        core.error('Failure occurred while waiting for instance.')
        await removeTask(taskId)
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

async function getTask(taskId) {
  const url = config.input.slabUrl
  const route = `task_status/${config.githubContext.repo}/${taskId}`
  let response

  try {
    response = await fetch(concat_path(url, route))
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

async function removeTask(taskId) {
  const url = config.input.slabUrl
  const route = `task_delete/${config.githubContext.repo}/${taskId}`
  let response

  try {
    response = await fetch(concat_path(url, route), {
      method: 'DELETE'
    })
  } catch (error) {
    core.error(`Failed to remove task status with ID: ${taskId}`)
    throw error
  }

  if (response.ok) {
    core.debug('Instance task successfully removed')
    return response
  } else {
    core.error(
      `Instance task status removal has failed (ID: ${taskId}, HTTP status code: ${response.status})`
    )
    throw new Error('task removal failed')
  }
}

async function acknowledgeTaskDone(taskId) {
  const url = config.input.slabUrl
  const route = `task_ack_done/${config.githubContext.repo}/${taskId}`
  let response

  try {
    response = await fetch(concat_path(url, route), {
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
  waitForInstance
}
