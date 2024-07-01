const crypto = require('node:crypto')
const core = require('@actions/core')
const config = require('./config')
const utils = require('./utils')

function getSignature(content) {
  const hmac = crypto.createHmac('sha256', config.input.jobSecret)
  hmac.update(content)
  return hmac.digest('hex')
}

async function startInstanceRequest() {
  const url = config.input.slabUrl
  const provider = config.input.backend

  const details = {
    backend: {
      provider,
      profile: config.input.profile
    }
  }

  const payload = {
    details,
    sha: config.githubContext.sha,
    git_ref: config.githubContext.ref
  }

  const body = JSON.stringify(payload)
  const signature = getSignature(body)

  try {
    core.info(`Request ${provider} instance start`)

    const response = await fetch(url.concat('/job'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Slab-Repository': `${config.githubContext.owner}/${config.githubContext.repo}`,
        'X-Slab-Command': 'start_instance',
        'X-Hub-Signature-256': `sha256=${signature}`
      },
      body: body.toString()
    })

    if (response.ok) {
      core.info(`${provider} instance start successfully requested`)
      return await response.json()
    } else {
      core.setFailed(
        `${provider} instance start request has failed (HTTP status code: ${response.status})`
      )
    }
  } catch (error) {
    core.error(`${provider} instance start request has failed`)
    throw error
  }
}

async function waitForInstance(taskId, taskName) {
  for (let i = 0; i < 60; i++) {
    await utils.sleep(15)

    try {
      const response = await getTask(taskId)

      if (response.ok) {
        const body = await response.json()
        if (body[taskName].status.toLowerCase() === 'done') {
          await removeTask(taskId)
          return body
        } else if (body[taskName].status.toLowerCase() === 'failed') {
          await removeTask(taskId)
          core.error(
            `Instance task failed (details: ${body[taskName].status.details})`
          )
          core.setFailed('Failure occurred while waiting for instance.')
        }
      } else {
        core.error(
          `Failed to wait for instance (HTTP status code: ${response.status})`
        )
      }
    } catch (error) {
      core.error('Failed to fetch or remove instance task')
      throw error
    }
  }

  core.setFailed(
    'Timeout while waiting for instance to be running after 15 mins.'
  )
}

async function terminateInstanceRequest(runnerName) {
  const url = config.input.slabUrl

  const payload = {
    runner_name: runnerName,
    action: 'terminate',
    sha: config.githubContext.sha,
    git_ref: config.githubContext.ref
  }

  const body = JSON.stringify(payload)
  const signature = getSignature(body)

  try {
    core.info(`Request instance termination (runner: ${runnerName})`)

    const response = await fetch(url.concat('/job'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Slab-Repository': `${config.githubContext.owner}/${config.githubContext.repo}`,
        'X-Slab-Command': 'stop_instance',
        'X-Hub-Signature-256': `sha256=${signature}`
      },
      body: body.toString()
    })

    if (response.ok) {
      core.info('Instance termination successfully requested')
      return response.json()
    } else {
      core.setFailed(
        `Instance termination request has failed (HTTP status code: ${response.status})`
      )
    }
  } catch (error) {
    core.error('Instance termination request has failed')
    throw error
  }
}

async function getTask(taskId) {
  try {
    const url = config.input.slabUrl
    const route = `task_status/${config.githubContext.repo}/${taskId}`

    const response = await fetch(url.concat(route))
    if (response.ok) {
      core.debug('Instance task successfully fetched')
      return response
    } else {
      core.setFailed(
        `Instance task status request has failed (ID: ${taskId}, HTTP status code: ${response.status})`
      )
    }
  } catch (error) {
    core.error(`Failed to fetch task status with ID: ${taskId}`)
    throw error
  }
}

async function removeTask(taskId) {
  try {
    const url = config.input.slabUrl
    const route = `task_delete/${config.githubContext.repo}/${taskId}`

    const response = await fetch(url.concat(route), {
      method: 'DELETE'
    })
    if (response.ok) {
      core.debug('Instance task successfully removed')
      return response
    } else {
      core.setFailed(
        `Instance task status removal has failed (ID: ${taskId}, HTTP status code: ${response.status})`
      )
    }
  } catch (error) {
    core.error(`Failed to remove task status with ID: ${taskId}`)
    throw error
  }
}

module.exports = {
  startInstanceRequest,
  terminateInstanceRequest,
  waitForInstance
}
