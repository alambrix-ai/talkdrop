# Talkdrop production Terraform skeleton (Phase 6)

Placeholder for cloud provider modules (VPC, managed Postgres, Redis, S3, LiveKit/coturn, K8s).

**Do not apply as-is.** Fill provider, region, and secrets after owner decision on hosting (SPEC §18).

Suggested modules:
- `network` — VPC / subnets
- `data` — Postgres 16 + Redis 7
- `storage` — evidence bucket with 24h lifecycle
- `compute` — EKS/GKE/AKS + IAM for API/worker
- `edge` — CDN for `apps/web` static assets

Secrets via the cloud secret manager; never commit `.tfvars` with credentials.
