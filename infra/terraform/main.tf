# Talkdrop production skeleton — do not apply without filling provider/backend.
terraform {
  required_version = ">= 1.5"
  required_providers {
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
  }
}

# Placeholder resource so `terraform validate` can run in CI without cloud creds.
resource "null_resource" "talkdrop_skeleton" {
  triggers = {
    project = "talkdrop"
    phase   = "6-hardening"
  }
}

output "note" {
  value = "Replace with VPC/Postgres/Redis/S3/K8s modules per infra/terraform/README.md"
}
