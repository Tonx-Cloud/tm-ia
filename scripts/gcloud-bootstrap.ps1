param(
  [Parameter(Mandatory=$true)][string]$ProjectId,
  [Parameter(Mandatory=$false)][string]$Region = "us-central1"
)

$ErrorActionPreference = 'Stop'

Write-Host "Setting project: $ProjectId" -ForegroundColor Cyan
gcloud config set project $ProjectId | Out-Host

Write-Host "Enabling core APIs..." -ForegroundColor Cyan
gcloud services enable `
  serviceusage.googleapis.com `
  cloudresourcemanager.googleapis.com `
  iam.googleapis.com `
  iamcredentials.googleapis.com `
  storage.googleapis.com `
  secretmanager.googleapis.com | Out-Host

Write-Host "Done. Enabled services:" -ForegroundColor Green
gcloud services list --enabled --format="value(config.name)" | Select-String -Pattern "serviceusage|cloudresourcemanager|iam|iamcredentials|storage|secretmanager" | Out-Host

Write-Host "Region (FYI): $Region" -ForegroundColor DarkGray
