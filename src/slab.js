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
  const payload = {
    region: config.input.region,
    image_id: config.input.ec2ImageId,
    instance_type: config.input.ec2InstanceType,
    sha: config.githubContext.sha
  }
  if (config.input.subnetId) {
    payload.subnet_id = config.input.subnetId
  }
  if (config.input.securityGroupIds) {
    payload.security_group_ids = config.input.securityGroupIds
  }

  const body = JSON.stringify(payload)
  const signature = getSignature(body)

  try {
    core.info('Request AWS EC2 instance start')

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
      core.info('AWS EC2 instance start successfully requested')
      return await response.json()
    } else {
      core.setFailed(
        `AWS EC2 instance start request has failed (HTTP status code: ${response.status})`
      )
    }
  } catch (error) {
    core.error('AWS EC2 instance start request has failed')
    throw error
  }
}

async function waitForInstance(taskId, taskName) {
  for (let i = 0; i < 30; i++) {
    await utils.sleep(15)

    try {
      const response = await getTask(taskId)

      if (response.ok) {
        const body = await response.json()
        if (body[taskName].status.toLowerCase() === 'done') {
          await removeTask(taskId)
          return body
        }
      } else {
        core.error(
          `Failed to wait for AWS EC2 instance (HTTP status code: ${response.status})`
        )
      }
    } catch (error) {
      core.error('Failed to fetch or remove AWS EC2 instance task')
      throw error
    }
  }

  core.setFailed(
    'Timeout while waiting for AWS EC2 instance to be running after 15 mins.'
  )
}

async function terminateInstanceRequest(runnerName) {
  const url = config.input.slabUrl
  const payload = {
    region: config.input.region,
    runner_name: runnerName,
    action: 'terminate',
    sha: config.githubContext.sha
  }
  const body = JSON.stringify(payload)
  const signature = getSignature(body)

  try {
    core.info('Request AWS EC2 instance termination')

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
      core.info('AWS EC2 instance termination successfully requested')
      return response.json()
    } else {
      core.setFailed(
        `AWS EC2 instance termination request has failed (HTTP status code: ${response.status})`
      )
    }
  } catch (error) {
    core.error('AWS EC2 instance termination request has failed')
    throw error
  }
}

async function getTask(taskId) {
  try {
    const url = config.input.slabUrl
    const route = `/task_status/${config.githubContext.owner}/${config.githubContext.repo}/${config.input.region}/${taskId}`

    const response = await fetch(url.concat(route))
    if (response.ok) {
      core.debug('AWS EC2 instance task successfully fetched')
      return response
    } else {
      core.setFailed(
        `AWS EC2 instance task request has failed (HTTP status code: ${response.status})`
      )
    }
  } catch (error) {
    core.error(`Failed to fetch EC2 task status with ID: ${taskId}`)
    throw error
  }
}

async function removeTask(taskId) {
  try {
    const url = config.input.slabUrl
    const route = `/task_delete/${config.githubContext.owner}/${config.githubContext.repo}/${config.input.region}/${taskId}`

    const response = await fetch(url.concat(route), {
      method: 'DELETE'
    })
    if (response.ok) {
      core.debug('AWS EC2 instance task successfully removed')
      return response
    } else {
      core.setFailed(
        `AWS EC2 instance task removal has failed (HTTP status code: ${response.status})`
      )
    }
  } catch (error) {
    core.error(`Failed to remove EC2 task status with ID: ${taskId}`)
    throw error
  }
}

module.exports = {
  startInstanceRequest,
  terminateInstanceRequest,
  waitForInstance
}
