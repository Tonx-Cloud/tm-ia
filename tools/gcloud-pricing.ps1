$ErrorActionPreference = 'Stop'

$tok = & gcloud auth print-access-token
if (-not $tok) { throw 'No gcloud auth session. Run: gcloud auth login' }

$headers = @{ Authorization = "Bearer $tok" }

$resp = Invoke-RestMethod -Headers $headers -Uri 'https://cloudbilling.googleapis.com/v1/services?pageSize=5000'

$resp.services |
  Where-Object { $_.displayName -match 'Vertex|Generative|Video|AI Platform' } |
  Select-Object displayName, name |
  Sort-Object displayName |
  Select-Object -First 80 |
  Format-Table -AutoSize
