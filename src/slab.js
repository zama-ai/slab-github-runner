import crypto from 'node:crypto'
import {
  debug as setDebug,
  error as setError,
  info as setInfo,
  warning as setWarning
} from '@actions/core'
import utils from './utils'

export class StartRequestError extends Error {}
export class StopRequestError extends Error {}
export class WaitError extends Error {}
export class TaskError extends Error {}

function getSignature(config, content) {
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

async function startInstanceRequest(config) {
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
  const signature = getSignature(config, body)
  let response

  setInfo(`Request ${provider} instance start`)

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
    setError('Fetch call has failed')
    throw new StartRequestError(error.message)
  }

  if (response.ok) {
    setInfo(`${provider} instance start successfully requested`)
    return await response.json()
  } else {
    const respBody = await response.text()
    setError(
      `${provider} instance start request has failed (HTTP status code: ${response.status}, body: ${respBody})`
    )
    throw new StartRequestError('instance start request failed')
  }
}

async function stopInstanceRequest(config, runnerName) {
  const url = config.input.slabUrl

  const payload = {
    runner_name: runnerName,
    sha: config.githubContext.sha,
    git_ref: config.githubContext.ref
  }

  const body = JSON.stringify(payload)
  const signature = getSignature(config, body)
  let response

  setInfo(`Request instance stop (runner: ${runnerName})`)

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
    setError('Instance stop request has failed')
    throw new StopRequestError(error.message)
  }

  if (response.ok) {
    setInfo('Instance stop successfully requested')
    return response.json()
  } else {
    const respBody = await response.text()
    setError(
      `Instance stop request has failed (HTTP status code: ${response.status}, body: ${respBody})`
    )
    throw new StopRequestError('instance stop request failed')
  }
}

async function waitForGithub(config, taskId, taskName) {
  setInfo(`Wait for GitHub on ${taskName} (task ID: ${taskId})`)

  const routeRootPath = 'github_task'

  // while (true) equivalent to please ESLint
  for (;;) {
    await utils.sleep(15)

    setInfo('Checking...')
    let response
    try {
      response = await getTask(config, routeRootPath, taskId)
    } catch (error) {
      throw new WaitError(
        `github task fetch failed (details: ${error.message})`
      )
    }

    if (response.ok) {
      const body = await response.json()
      const taskStatus = body[taskName].status.toLowerCase()

      if (taskStatus === 'done') {
        return body
      } else if (taskStatus === 'failed') {
        if (taskName === 'runner_unregister') {
          setWarning(
            `Github runner ${body[taskName].details.runner_name} unregistration failed.`
          )
          return body
        } else {
          setError(`GitHub task failed (details: ${body[taskName].details})`)
          setError('Failure occurred while waiting for GitHub.')
          throw new WaitError('github task reports failure')
        }
      }
    } else {
      setError(
        `Failed to wait for GitHub task (HTTP status code: ${response.status})`
      )
      throw new WaitError('github waiting failed')
    }
  }
}

async function waitForInstance(config, taskId, taskName) {
  setInfo(`Wait for instance to ${taskName} (task ID: ${taskId})`)

  const routeRootPath = 'backend_task'

  // while (true) equivalent to please ESLint
  for (;;) {
    await utils.sleep(15)

    setInfo('Checking...')
    let response
    try {
      response = await getTask(config, routeRootPath, taskId)
    } catch (error) {
      throw new WaitError(
        `instance task fetch failed (details: ${error.message})`
      )
    }

    if (response.ok) {
      const body = await response.json()
      const taskStatus = body[taskName].status.toLowerCase()

      if (taskStatus === 'done') {
        if (taskName === 'start') {
          let ack_response
          try {
            ack_response = await acknowledgeTaskDone(config, taskId)
          } catch (error) {
            throw new WaitError(
              `instance task acknowledgement failed (details: ${error.message})`
            )
          }
          if (!ack_response.ok) {
            throw new WaitError(
              `instance task acknowledgement failed (HTTP status code: ${ack_response.status}`
            )
          }
        }
        return body
      } else if (taskStatus === 'failed') {
        setError(`Instance task failed (details: ${body[taskName].details})`)
        setError('Failure occurred while waiting for instance.')
        throw new WaitError('instance task reports failure')
      }
    } else {
      setError(
        `Failed to wait for instance (HTTP status code: ${response.status})`
      )
      throw new WaitError('instance waiting failed')
    }
  }
}

async function getTask(config, routeRootPath, taskId) {
  const url = config.input.slabUrl
  const route = `${routeRootPath}/${config.githubContext.repo}/${taskId}`
  let response

  try {
    response = await fetch(concatPath(url, route))
  } catch (error) {
    setError(`Failed to fetch task status with ID: ${taskId}`)
    throw new TaskError(error.message)
  }

  if (response.ok) {
    setDebug('Instance task successfully fetched')
  } else {
    setError(
      `Instance task status request has failed (ID: ${taskId}, HTTP status code: ${response.status})`
    )
  }
  return response
}

async function acknowledgeTaskDone(config, taskId) {
  const url = config.input.slabUrl
  const route = `backend_task_ack_done/${config.githubContext.repo}/${taskId}`
  let response

  try {
    response = await fetch(concatPath(url, route), {
      method: 'POST'
    })
  } catch (error) {
    setError(`Failed to acknowledge task done with ID: ${taskId}`)
    throw new TaskError(error.message)
  }

  if (response.ok) {
    setDebug('Instance task successfully acknowledged')
  } else {
    setError(
      `Instance task acknowledgment request has failed (ID: ${taskId}, HTTP status code: ${response.status})`
    )
  }
  return response
}

export default {
  startInstanceRequest,
  stopInstanceRequest,
  waitForGithub,
  waitForInstance
}
