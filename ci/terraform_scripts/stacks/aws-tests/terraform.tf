terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.41"
    }
  }
  required_version = ">= 0.13"
}
provider "aws" {
  region = "eu-west-3"
}

variable "instance_type" {
  type        = string
  description = "EC2 instance type to be used"
}

variable "instance_label" {
  type        = string
  description = "EC2 instance name to display in console"
}

variable "user_data" {
  type        = string
  description = "Script that will be run at instance startup"
}

resource "aws_instance" "cpu_small" {
  ami           = "ami-0eda00173fe323828"
  instance_type = var.instance_type
  user_data     = var.user_data
  monitoring    = true

  # checkov:skip=CKV2_AWS_41:No rule is used since the spawned instance will do nothing

  ebs_optimized = true
  ebs_block_device {
    device_name = "/dev/sdg"
    encrypted   = true
  }

  metadata_options {
    http_tokens = "required"
  }

  tags = {
    Name = var.instance_label
  }
}

output "instance_id" {
  value       = aws_instance.cpu_small.id
  description = "Unique ID of the EC2 instance"
}
