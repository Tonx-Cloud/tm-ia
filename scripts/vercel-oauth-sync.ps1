param(
  [Parameter(Mandatory=$true)][string]$GoogleClientId,
  [Parameter(Mandatory=$true)][string]$GoogleClientSecret
)

$ErrorActionPreference = 'Stop'

$cid = $GoogleClientId.Trim()
$cs  = $GoogleClientSecret.Trim()

Write-Host "Updating Vercel env vars (Production + Preview)..." -ForegroundColor Cyan

# Use stdin piping to avoid interactive prompts
$cid | vercel env add GOOGLE_CLIENT_ID production --force --sensitive | Out-Host
$cs  | vercel env add GOOGLE_CLIENT_SECRET production --force --sensitive | Out-Host
$cid | vercel env add GOOGLE_CLIENT_ID preview --force --sensitive | Out-Host
$cs  | vercel env add GOOGLE_CLIENT_SECRET preview --force --sensitive | Out-Host

Write-Host "Redeploying production..." -ForegroundColor Cyan
vercel --prod --force | Out-Host

Write-Host "Done." -ForegroundColor Green
