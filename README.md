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

| Name                 | Required                                   | Description                                                                                                                                                                                                     |
|----------------------|--------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `mode`               | Always required.                           | Specify here which mode you want to use: `start` to start a new runner, `stop` to stop the previously created runner.                                                                                           |
| `github-token`       | Always required.                           | GitHub Personal Access Token with the `repo` scope assigned.                                                                                                                                                    |
| `slab-url`           | Always required.                           | URL to Slab CI server.                                                                                                                                                                                          |
| `job-secret`         | Always required.                           | Secret key used by Slab to perform HMAC computation.                                                                                                                                                            |
| `region`             | Always required.                           | AWS deploy region.                                                                                                                                                                                              |
| `ec2-image-id`       | Required if you use the `start` mode.      | EC2 Image ID (AMI).The new runner will be launched from this image. The action is compatible with Amazon Linux 2 images.                                                                                        |
| `ec2-instance-type`  | Required if you use the `start` mode.      | EC2 Instance Type.                                                                                                                                                                                              |
| `subnet-id`          | Optional. Used only with the `start` mode. | VPC Subnet ID.The subnet should belong to the same VPC as the specified security group.                                                                                                                         |
| `security-group-ids` | Optional. Used only with the `start` mode. | EC2 Security Group IDs.The security group should belong to the same VPC as the specified subnet.Only the outbound traffic for port 443 should be allowed. No inbound traffic is required.                       |
| `label`              | Required if you use the `stop` mode.       | Name of the unique label assigned to the runner.The label is provided by the output of the action in the `start` mode.The label is used to remove the runner from GitHub when the runner is not needed anymore. |
| `ec2-instance-id`    | Required if you use the `stop` mode.       | EC2 Instance ID of the created runner.The ID is provided by the output of the action in the `start` mode.The ID is used to terminate the EC2 instance when the runner is not needed anymore.                    |                                                                                                                                        |

### Outputs

| Name              | Description                                                                                                                                                                                                           |
|-------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `label`           | Name of the unique label assigned to the runner. The label is used in two cases: to use as the input of `runs-on` property for the following jobs and to remove the runner from GitHub when it is not needed anymore. |
| `ec2-instance-id` | EC2 Instance ID of the created runner.The ID is used to terminate the EC2 instance when the runner is not needed anymore.                                                                                             |

### Example

The workflow showed in the picture above and declared in `do-the-job.yml` looks like this:

```yml
name: do-the-job
on: pull_request
jobs:
  start-runner:
    name: Start self-hosted EC2 runner
    runs-on: ubuntu-latest
    outputs:
      label: ${{ steps.start-ec2-runner.outputs.label }}
      ec2-instance-id: ${{ steps.start-ec2-runner.outputs.ec2-instance-id }}
    steps:
      - name: Start EC2 runner
        id: start-ec2-runner
        uses: zama-ai/slab-github-runner@v1
        with:
          mode: start
          github-token: ${{ secrets.GH_PERSONAL_ACCESS_TOKEN }}
          region: eu-west-3
          ec2-image-id: ami-123
          ec2-instance-type: t3.nano
          subnet-id: subnet-123  # Optional
          security-group-id: sg-123  # Optional

  do-the-job:
    name: Do the job on the runner
    needs: start-runner # required to start the main job when the runner is ready
    runs-on: ${{ needs.start-runner.outputs.label }} # run the job on the newly created runner
    steps:
      - name: Hello World
        run: echo 'Hello World!'

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
          label: ${{ needs.start-runner.outputs.label }}
          ec2-instance-id: ${{ needs.start-runner.outputs.ec2-instance-id }}
```

## License Summary

This code is made available under the [MIT license](LICENSE).
