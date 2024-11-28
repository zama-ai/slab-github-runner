# On-demand self-hosted runner for GitHub Actions

Start your EC2 [self-hosted runner](https://docs.github.com/en/free-pro-team@latest/actions/hosting-your-own-runners)
right before you need it.
Run the job on it. Finally, stop it when you finish.
And all this automatically as a part of your GitHub Actions workflow.

It relies on Slab CI bot to do all the heavy-lifting.

See [below](#example) the YAML code of the depicted workflow.

## Table of Contents

- [Usage](#usage)
  - [Inputs](#inputs)
  - [Outputs](#outputs)
  - [Example](#example)
- [License Summary](#license-summary)

## Usage

### Inputs

| Name           | Required                    | Description                                                                                                                                                                                 |
|----------------|-----------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `mode`         | Always required.            | Specify here which mode you want to use: `start` to start a new runner, `stop` to stop the previously created runner.                                                                       |
| `github-token` | Always required.            | GitHub Personal Access Token with the `repo` scope assigned.                                                                                                                                |
| `slab-url`     | Always required.            | URL to Slab CI server.                                                                                                                                                                      |
| `job-secret`   | Always required.            | Secret key used by Slab to perform HMAC computation.                                                                                                                                        |
| `backend`      | Required with `start` mode. | Backend provider name to look for in slab.toml file in repository that uses the action.                                                                                                     |
| `profile`      | Required with `start` mode. | Profile to use as described slab.toml file in repository that uses the action.                                                                                                              |
| `runner-id`    | Required with `stop` mode.  | Unique ID assigned to the runner.The ID is provided by the output of the action in the `start` mode. The ID is used to remove the runner from GitHub when the runner is not needed anymore. |

### Outputs

| Name    | Description                                                                                                                                     |
|---------|-------------------------------------------------------------------------------------------------------------------------------------------------|
| `label` | Name of the unique label assigned to the runner. Use `label` as the input of `runs-on` workflow property to run subsequent jobs.                |
| `id`    | Unique ID assigned to the runner. Use `id` as input of `runner-id` action property remove the runner from GitHub when it is not needed anymore. |

### Examples

Here's an example workflow. It uses a backend profile declared in `ci/slab.toml` within the calling repository

```yml
name: do-the-job
on: pull_request
jobs:
  start-runner:
    name: Start self-hosted EC2 runner
    runs-on: ubuntu-latest
    outputs:
      label: ${{ steps.start-ec2-runner.outputs.label }}
      id: ${{ steps.start-ec2-runner.outputs.id }}
    steps:
      - name: Start EC2 runner
        id: start-ec2-runner
        uses: zama-ai/slab-github-runner@v1
        with:
          mode: start
          github-token: ${{ secrets.GH_PERSONAL_ACCESS_TOKEN }}
          backend: aws
          profile: cpu-test

  do-the-job:
    needs: start-runner
    runs-on: ${{ needs.start-runner.outputs.label }}
    steps:
      # ... #

  stop-runner:
    name: Stop self-hosted EC2 runner
    needs:
      - start-runner # required to get output from the start-runner job
      - do-the-job # required to wait when the main job is done
    runs-on: ubuntu-latest
    if: ${{ always() }} # required to stop the runner even if the error happened in the previous jobs
    steps:
      - name: Stop EC2 runner
        uses: zama-ai/slab-github-runner@v1
        with:
          mode: stop
          github-token: ${{ secrets.GH_PERSONAL_ACCESS_TOKEN }}
          runner-id: ${{ needs.start-runner.outputs.id }}
```

## License Summary

This code is made available under the [MIT license](LICENSE).
