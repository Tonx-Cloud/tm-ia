# Infra (Google Cloud) - TM-IA

This folder holds infrastructure-as-code and scripts to bootstrap Google Cloud for the TM-IA project.

## Prereqs

- PowerShell
- `gcloud` authenticated
- Billing enabled on the project

## Quick start (PowerShell)

```powershell
# From repo root
.\scripts\gcloud-bootstrap.ps1 -ProjectId tonx-cloud -Region us-central1

# Create SA + IAM + key (stores key JSON as a local file)
.\scripts\gcloud-service-account.ps1 -ProjectId tonx-cloud -ServiceAccountName tm-ia-backend

# Optional: apply Terraform
cd infra
terraform init
terraform apply -var project_id=tonx-cloud -var region=us-central1 -var bucket_name=t-movies-tonx-cloud
```

## Notes

- `bucket_name` must be globally unique.
- For Google OAuth (Web Client), Google does not provide a clean `gcloud`-only workflow. We keep it as a manual Console step (or later Terraform/API automation).
