param(
  [Parameter(Mandatory=$true)][string]$ProjectId,
  [Parameter(Mandatory=$true)][string]$ServiceAccountName,
  [Parameter(Mandatory=$false)][string]$BucketName = "t-movies-tonx-cloud"
)

$ErrorActionPreference = 'Stop'

$saId = $ServiceAccountName
$saEmail = "$saId@$ProjectId.iam.gserviceaccount.com"

Write-Host "Ensuring project is set: $ProjectId" -ForegroundColor Cyan
gcloud config set project $ProjectId | Out-Host

Write-Host "Creating service account (if missing): $saId" -ForegroundColor Cyan
try {
  gcloud iam service-accounts describe $saEmail | Out-Null
  Write-Host "Service account already exists: $saEmail" -ForegroundColor Yellow
} catch {
  gcloud iam service-accounts create $saId --display-name "TM-IA Backend" | Out-Host
}

Write-Host "Granting Secret Manager accessor (project-level)" -ForegroundColor Cyan
gcloud projects add-iam-policy-binding $ProjectId --member "serviceAccount:$saEmail" --role "roles/secretmanager.secretAccessor" | Out-Host

Write-Host "Granting Storage objectAdmin (bucket-level): $BucketName" -ForegroundColor Cyan
gsutil iam ch "serviceAccount:$saEmail:roles/storage.objectAdmin" "gs://$BucketName" | Out-Host

# Create a key file locally (DO NOT COMMIT)
$keyOut = Join-Path (Get-Location) ("$saId-key.json")
if (Test-Path $keyOut) {
  Write-Host "Key file already exists (not overwriting): $keyOut" -ForegroundColor Yellow
} else {
  Write-Host "Creating service account key (local file): $keyOut" -ForegroundColor Cyan
  gcloud iam service-accounts keys create $keyOut --iam-account $saEmail | Out-Host
  Write-Host "IMPORTANT: store this key securely. Do NOT commit it." -ForegroundColor Red
}

Write-Host "Service account email: $saEmail" -ForegroundColor Green
