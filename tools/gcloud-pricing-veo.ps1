$ErrorActionPreference = 'Stop'

$tok = & gcloud auth print-access-token
if (-not $tok) { throw 'No gcloud auth session. Run: gcloud auth login' }
$headers = @{ Authorization = "Bearer $tok" }

$service = 'services/3AFC-B84F-8D20' # Vertex AI (from services list)

$uri = "https://cloudbilling.googleapis.com/v1/$service/skus?pageSize=5000"
$all = @()
while ($uri) {
  $resp = Invoke-RestMethod -Headers $headers -Uri $uri
  if ($resp.skus) { $all += $resp.skus }
  if ($resp.nextPageToken) {
    $uri = "https://cloudbilling.googleapis.com/v1/$service/skus?pageSize=5000&pageToken=$($resp.nextPageToken)"
  } else {
    $uri = $null
  }
}

Write-Host "Total SKUs: $($all.Count)"

# Show some sample descriptions
$all | Select-Object -First 30 -Property skuId, description | Format-Table -AutoSize

Write-Host "\n---- Contains 'video' ----"
$video = $all | Where-Object { $_.description -match 'video' }
Write-Host "Video matches: $($video.Count)"
$video | Select-Object -First 40 -Property skuId, description, @{n='usageUnit';e={$_.pricingInfo[0].pricingExpression.usageUnit}}, @{n='unitPriceUSD';e={
  $u=$_.pricingInfo[0].pricingExpression.tieredRates[0].unitPrice
  [math]::Round((($u.units -as [double]) + ($u.nanos/1e9)), 10)
}} | Format-Table -AutoSize

Write-Host "\n---- Contains 'Veo' ----"
$veo = $all | Where-Object { $_.description -match 'Veo' }
Write-Host "Veo matches: $($veo.Count)"
$veo | Select-Object -First 40 -Property skuId, description, @{n='usageUnit';e={$_.pricingInfo[0].pricingExpression.usageUnit}}, @{n='unitPriceUSD';e={
  $u=$_.pricingInfo[0].pricingExpression.tieredRates[0].unitPrice
  [math]::Round((($u.units -as [double]) + ($u.nanos/1e9)), 10)
}} | Format-Table -AutoSize
