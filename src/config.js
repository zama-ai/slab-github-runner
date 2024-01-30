const core = require('@actions/core')
const github = require('@actions/github')

class Config {
  constructor() {
    this.input = {
      mode: core.getInput('mode'),
      githubToken: core.getInput('github-token'),
      slabUrl: core.getInput('slab-url'),
      jobSecret: core.getInput('job-secret'),
      profile: core.getInput('profile'),
      region: core.getInput('region'),
      ec2ImageId: core.getInput('ec2-image-id'),
      ec2InstanceType: core.getInput('ec2-instance-type'),
      subnetId: core.getInput('subnet-id'),
      securityGroupIds: core.getInput('security-group-ids'),
      label: core.getInput('label')
    }

    // the values of github.context.repo.owner and github.context.repo.repo are taken from
    // the environment variable GITHUB_REPOSITORY specified in "owner/repo" format and
    // provided by the GitHub Action on the runtime
    this.githubContext = {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      sha: github.context.sha,
      ref: github.context.ref
    }

    //
    // validate input
    //

    if (!this.input.mode) {
      throw new Error(`The 'mode' input is not specified`)
    }

    if (!this.input.githubToken) {
      throw new Error(`The 'github-token' input is not specified`)
    }

    if (!this.input.slabUrl) {
      throw new Error(`The 'slab-url' input is not specified`)
    }

    if (!this.input.jobSecret) {
      throw new Error(`The 'job-secret' input is not specified`)
    }

    if (
      this.input.profile &&
      (this.input.region ||
        this.input.ec2ImageId ||
        this.input.ec2InstanceType ||
        this.input.subnetId ||
        this.input.securityGroupIds)
    ) {
      throw new Error(
        `The 'profile' input is mutually exclusive with any AWS related inputs`
      )
    }

    if (!this.input.profile && !this.input.region) {
      throw new Error(`The 'region' input is not specified`)
    }

    if (this.input.mode === 'start') {
      if (
        !this.input.profile &&
        (!this.input.ec2ImageId || !this.input.ec2InstanceType)
      ) {
        throw new Error(
          `Not all the required inputs are provided for the 'start' mode`
        )
      }
    } else if (this.input.mode === 'stop') {
      if (!this.input.label) {
        throw new Error(
          `Not all the required inputs are provided for the 'stop' mode`
        )
      }
    } else {
      throw new Error('Wrong mode. Allowed values: start, stop.')
    }
  }
}

try {
  module.exports = new Config()
} catch (error) {
  core.error(error)
  core.setFailed(error.message)
}
