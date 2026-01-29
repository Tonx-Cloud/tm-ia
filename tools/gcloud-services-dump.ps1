$ErrorActionPreference = 'Stop'
$tok = & gcloud auth print-access-token
if (-not $tok) { throw 'No gcloud auth session. Run: gcloud auth login' }
$headers = @{ Authorization = "Bearer $tok" }
$resp = Invoke-RestMethod -Headers $headers -Uri 'https://cloudbilling.googleapis.com/v1/services?pageSize=5000'
$resp.services | ConvertTo-Json -Depth 6 | Out-File -Encoding utf8 'D:\tm-ia\tools\cloudbilling-services.json'
Write-Host "Wrote services: $($resp.services.Count)"
