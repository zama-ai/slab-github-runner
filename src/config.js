import { getInput } from '@actions/core'
import { context } from '@actions/github'

export class ModeError extends Error {}
export class GithubTokenError extends Error {}
export class SlabUrlError extends Error {}
export class JobSecretError extends Error {}

export class Config {
  constructor() {
    this.input = {
      mode: getInput('mode'),
      githubToken: getInput('github-token'),
      slabUrl: getInput('slab-url'),
      jobSecret: getInput('job-secret'),
      backend: getInput('backend').toLowerCase(),
      profile: getInput('profile').toLowerCase(),
      label: getInput('label')
    }

    // the values of github.context.repo.owner and github.context.repo.repo are taken from
    // the environment variable GITHUB_REPOSITORY specified in "owner/repo" format and
    // provided by the GitHub Action on the runtime
    this.githubContext = {
      owner: context.repo.owner,
      repo: context.repo.repo,
      sha: context.sha,
      ref: context.ref
    }

    //
    // validate input
    //

    if (!this.input.mode) {
      throw new ModeError("The 'mode' input is not specified")
    }

    if (!this.input.githubToken) {
      throw new GithubTokenError("The 'github-token' input is not specified")
    }

    if (!this.input.slabUrl) {
      throw new SlabUrlError("The 'slab-url' input is not specified")
    }

    if (!this.input.jobSecret) {
      throw new JobSecretError("The 'job-secret' input is not specified")
    }

    if (this.input.mode === 'start') {
      if (!this.input.backend || !this.input.profile) {
        throw new ModeError(
          "Not all the required inputs are provided for the 'start' mode"
        )
      }
    } else if (this.input.mode === 'stop') {
      if (!this.input.label) {
        throw new ModeError(
          "Not all the required inputs are provided for the 'stop' mode"
        )
      }
    } else {
      throw new ModeError('Wrong mode. Allowed values: start, stop.')
    }
  }
}
