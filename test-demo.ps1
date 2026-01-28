#
# test-demo.ps1 — regressão completa do fluxo TM-IA
#
# Uso:
#   .\test-demo.ps1                           # Testa tudo exceto render
#   .\test-demo.ps1 -RunRender                # Inclui teste de render real
#   .\test-demo.ps1 -AudioPath "D:\audio.mp3" # Usa áudio específico
#   .\test-demo.ps1 -SkipPayment              # Pula testes de pagamento
#   .\test-demo.ps1 -Verbose                  # Saída detalhada
#
# Configuração:
#   $env:DEV_TOKEN="dev-token"; vercel dev --listen 3000
#   .\test-demo.ps1 -Token $env:DEV_TOKEN
#
# Saídas:
#   ./test-report.json  — relatório completo em JSON
#   ./test-report.md    — resumo em Markdown
#

param(
  [string]$BaseUrl = "http://localhost:3000",
  [string]$Token,
  [string]$AudioPath = "D:\tm-ia\test.mp3",
  [switch]$UseJwt,
  [switch]$RunRender,
  [switch]$SkipPayment,
  [switch]$SkipDemo,
  [int]$RenderTimeout = 120,
  [switch]$Verbose
)

$ErrorActionPreference = "Stop"

# Garantir System.Net.Http disponível
Add-Type -AssemblyName System.Net.Http

#region Utility Functions

function Mask-Token([string]$t) {
  if ([string]::IsNullOrWhiteSpace($t)) { return "" }
  if ($t.Length -le 10) { return ($t.Substring(0,3) + "...") }
  return ($t.Substring(0,7) + "..." + $t.Substring($t.Length-3,3))
}

function NowIso() { (Get-Date).ToString("s") }

function New-Result($name) {
  [PSCustomObject]@{
    name = $name
    ok = $false
    status = $null
    ms = $null
    error = $null
    requestId = $null
    body = $null
    details = $null
  }
}

function Write-Step($msg, $color="Cyan") { 
  Write-Host ""
  Write-Host ("=" * 60) -ForegroundColor DarkGray
  Write-Host $msg -ForegroundColor $color
  Write-Host ("=" * 60) -ForegroundColor DarkGray
}

function Write-Detail($msg) {
  if ($Verbose) { Write-Host "  $msg" -ForegroundColor DarkGray }
}

function Write-Success($msg) { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Failure($msg) { Write-Host "  [FAIL] $msg" -ForegroundColor Red }
function Write-Info($msg) { Write-Host "  [INFO] $msg" -ForegroundColor Yellow }

function Parse-JsonSafely([string]$raw) {
  try { return ($raw | ConvertFrom-Json) } catch { return $null }
}

#endregion

#region HTTP Client Setup

# Shared HttpClient
$handler = New-Object System.Net.Http.HttpClientHandler
$client  = New-Object System.Net.Http.HttpClient($handler)
$client.Timeout = [TimeSpan]::FromSeconds(180)
$client.DefaultRequestHeaders.Clear()

function Set-AuthHeader([string]$token) {
  $client.DefaultRequestHeaders.Remove("Authorization") | Out-Null
  $client.DefaultRequestHeaders.Add("Authorization", ("Bearer {0}" -f $token))
}

function Invoke-JsonPost([string]$url, [object]$payload, [int]$timeoutSec = 60) {
  $json = $payload | ConvertTo-Json -Depth 10 -Compress
  Write-Detail "POST $url"
  Write-Detail "Body: $json"
  $content = New-Object System.Net.Http.StringContent($json, [System.Text.Encoding]::UTF8, "application/json")
  $sw = [Diagnostics.Stopwatch]::StartNew()
  try {
    $resp = $client.PostAsync($url, $content).GetAwaiter().GetResult()
    $body = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    $sw.Stop()
    Write-Detail "Response ($([int]$resp.StatusCode)): $body"
    return @{ status = [int]$resp.StatusCode; bodyRaw = $body; ms = $sw.ElapsedMilliseconds }
  } catch {
    $sw.Stop()
    throw $_
  }
}

function Invoke-JsonGet([string]$url) {
  Write-Detail "GET $url"
  $sw = [Diagnostics.Stopwatch]::StartNew()
  try {
    $resp = $client.GetAsync($url).GetAwaiter().GetResult()
    $body = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    $sw.Stop()
    Write-Detail "Response ($([int]$resp.StatusCode)): $body"
    return @{ status = [int]$resp.StatusCode; bodyRaw = $body; ms = $sw.ElapsedMilliseconds }
  } catch {
    $sw.Stop()
    throw $_
  }
}

function Invoke-JsonDelete([string]$url) {
  Write-Detail "DELETE $url"
  $sw = [Diagnostics.Stopwatch]::StartNew()
  try {
    $resp = $client.DeleteAsync($url).GetAwaiter().GetResult()
    $body = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    $sw.Stop()
    Write-Detail "Response ($([int]$resp.StatusCode)): $body"
    return @{ status = [int]$resp.StatusCode; bodyRaw = $body; ms = $sw.ElapsedMilliseconds }
  } catch {
    $sw.Stop()
    throw $_
  }
}

function Invoke-MultipartUpload([string]$url, [string]$filePath) {
  $bytes = [System.IO.File]::ReadAllBytes($filePath)
  $fileName = [System.IO.Path]::GetFileName($filePath)
  Write-Detail "POST $url (multipart, file: $fileName, size: $($bytes.Length) bytes)"

  $content = New-Object System.Net.Http.MultipartFormDataContent
  $fileContent = [System.Net.Http.ByteArrayContent]::new([byte[]]$bytes)
  $fileContent.Headers.ContentType = New-Object System.Net.Http.Headers.MediaTypeHeaderValue("audio/mpeg")
  $content.Add($fileContent, "audio", $fileName)
  $client.DefaultRequestHeaders.ExpectContinue = $false

  $sw = [Diagnostics.Stopwatch]::StartNew()
  try {
    $resp = $client.PostAsync($url, $content).GetAwaiter().GetResult()
    $body = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    $sw.Stop()
    Write-Detail "Response ($([int]$resp.StatusCode)): $body"
    return @{ status = [int]$resp.StatusCode; bodyRaw = $body; ms = $sw.ElapsedMilliseconds }
  } catch {
    $sw.Stop()
    throw $_
  } finally {
    $content.Dispose()
    $fileContent.Dispose()
  }
}

#endregion

#region Test Functions

function Test-Health {
  $step = New-Result "health"
  Write-Step "Health Check (/api/health)"
  try {
    $r = Invoke-JsonGet ("{0}/api/health" -f $BaseUrl)
    $step.status = $r.status
    $step.ms = $r.ms
    $step.body = Parse-JsonSafely $r.bodyRaw
    $step.ok = ($r.status -eq 200)
    if ($step.ok) { Write-Success "API is healthy" }
    else { Write-Failure "API returned $($r.status)" }
  } catch {
    $step.error = $_.Exception.Message
    Write-Failure $step.error
  }
  return $step
}

function Test-Upload([string]$audioPath) {
  $step = New-Result "upload"
  Write-Step "Upload Audio (/api/upload)"
  try {
    $r = Invoke-MultipartUpload ("{0}/api/upload" -f $BaseUrl) $audioPath
    $step.status = $r.status
    $step.ms = $r.ms
    $step.body = Parse-JsonSafely $r.bodyRaw
    $step.ok = ($r.status -eq 200 -and $step.body -ne $null -and $step.body.filePath)
    if ($step.body.requestId) { $step.requestId = $step.body.requestId }
    
    if ($step.ok) { 
      Write-Success "Uploaded to: $($step.body.filePath)"
      $script:uploadedFilePath = $step.body.filePath
    } else { 
      Write-Failure "Upload failed (status: $($r.status))" 
    }
  } catch {
    $step.error = $_.Exception.Message
    Write-Failure $step.error
  }
  return $step
}

function Test-Transcribe([string]$filePath) {
  $step = New-Result "transcribe"
  Write-Step "Transcribe Audio (/api/demo/transcribe)"
  try {
    $payload = @{ filePath = $filePath }
    $r = Invoke-JsonPost ("{0}/api/demo/transcribe" -f $BaseUrl) $payload
    $step.status = $r.status
    $step.ms = $r.ms
    $step.body = Parse-JsonSafely $r.bodyRaw
    
    $tx = $null
    if ($step.body) {
      if ($step.body.transcription) { $tx = $step.body.transcription }
      elseif ($step.body.text) { $tx = $step.body.text }
    }
    $step.ok = ($r.status -eq 200 -and -not [string]::IsNullOrWhiteSpace($tx))
    
    if ($step.ok) {
      $preview = $tx.Substring(0, [Math]::Min(80, $tx.Length))
      Write-Success "Transcription: $preview..."
      $script:transcription = $tx
    } else {
      Write-Failure "Transcription failed"
    }
  } catch {
    $step.error = $_.Exception.Message
    Write-Failure $step.error
  }
  return $step
}

function Test-Hook([string]$transcription) {
  $step = New-Result "hook"
  Write-Step "Generate Hook (/api/demo/hook)"
  try {
    $payload = @{ transcription = $transcription }
    $r = Invoke-JsonPost ("{0}/api/demo/hook" -f $BaseUrl) $payload
    $step.status = $r.status
    $step.ms = $r.ms
    $step.body = Parse-JsonSafely $r.bodyRaw
    $step.ok = ($r.status -eq 200 -and $step.body -ne $null -and $step.body.hook)
    if ($step.body.requestId) { $step.requestId = $step.body.requestId }
    
    if ($step.ok) {
      Write-Success "Hook: $($step.body.hook)"
      $script:hookText = $step.body.hook
    } else {
      Write-Failure "Hook generation failed"
    }
  } catch {
    $step.error = $_.Exception.Message
    Write-Failure $step.error
  }
  return $step
}

function Test-Preview([string]$filePath, [string]$hook) {
  $step = New-Result "preview"
  Write-Step "Generate Preview (/api/demo/preview)"
  try {
    $payload = @{
      filePath = $filePath
      hook = $hook
      style = "cinematic"
    }
    $r = Invoke-JsonPost ("{0}/api/demo/preview" -f $BaseUrl) $payload
    $step.status = $r.status
    $step.ms = $r.ms
    $step.body = Parse-JsonSafely $r.bodyRaw
    $step.ok = ($r.status -eq 200 -and $step.body -ne $null -and $step.body.previewUrl)
    if ($step.body.requestId) { $step.requestId = $step.body.requestId }
    
    if ($step.ok) {
      $urlLen = $step.body.previewUrl.Length
      Write-Success "Preview URL generated ($urlLen chars)"
    } else {
      Write-Failure "Preview generation failed"
    }
  } catch {
    $step.error = $_.Exception.Message
    Write-Failure $step.error
  }
  return $step
}

function Test-CreateProject([string]$audioPath) {
  $step = New-Result "assets-create"
  Write-Step "Create Project (/api/assets)"
  try {
    # Generate a valid test image (100x100 red PNG)
    # This is a minimal valid PNG that FFmpeg can process
    $b64 = "iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAA0klEQVR4nO3QMQEAAAjDMKZf0dDghhUhZ0UOaQd0hqQd0BmSdkBnSNoBnSFpB3SGpB3QGZJ2QGdI2gGdIWkHdIakHdAZknZAZ0jaAZ0haQd0hqQd0BmSdkBnSNoBnSFpB3SGpB3QGf4Ad5RxAYbrJNIAAAAASUVORK5CYII="
    
    # Calculate cost (3 images * 30 credits = 90 credits)
    # Ensure user has enough credits first (buy 500 starter pack)
    $buy = Invoke-JsonPost ("{0}/api/credits/buy" -f $BaseUrl) @{ packageId = "starter"; mock = $true }
    
    $payload = @{
      prompts = @("Scene 1 - Intro", "Scene 2 - Main", "Scene 3 - Outro")
      base64Images = @("data:image/png;base64,$b64", "data:image/png;base64,$b64", "data:image/png;base64,$b64")
      audioPath = $audioPath
      count = 3 # explicit count
    }
    $r = Invoke-JsonPost ("{0}/api/assets" -f $BaseUrl) $payload
    $step.status = $r.status
    $step.ms = $r.ms
    $step.body = Parse-JsonSafely $r.bodyRaw
    $step.ok = ($r.status -eq 200 -and $step.body -ne $null -and $step.body.project -and $step.body.project.id)
    
    if ($step.ok) {
      $script:projectId = $step.body.project.id
      $assetCount = $step.body.project.assets.Count
      Write-Success "Project created: $($script:projectId) ($assetCount assets)"
    } else {
      Write-Failure "Project creation failed"
    }
  } catch {
    $step.error = $_.Exception.Message
    Write-Failure $step.error
  }
  return $step
}

function Test-Pricing-Packages {
  $step = New-Result "pricing-packages"
  Write-Step "List Packages (/api/credits/packages)"
  try {
    $r = Invoke-JsonGet ("{0}/api/credits/packages" -f $BaseUrl)
    $step.status = $r.status
    $step.ms = $r.ms
    $step.body = Parse-JsonSafely $r.bodyRaw
    $step.ok = ($r.status -eq 200 -and $step.body.packages.Count -gt 0)
    
    if ($step.ok) {
      $count = $step.body.packages.Count
      $first = $step.body.packages[0]
      Write-Success "Found $count packages (First: $($first.name) - $($first.credits) credits)"
    } else {
      Write-Failure "List packages failed"
    }
  } catch {
    $step.error = $_.Exception.Message
    Write-Failure $step.error
  }
  return $step
}

function Test-Pricing-Estimate {
  $step = New-Result "pricing-estimate"
  Write-Step "Estimate Cost (/api/credits/estimate)"
  try {
    $payload = @{
      action = "GENERATE_IMAGE"
      quantity = 5
    }
    $r = Invoke-JsonPost ("{0}/api/credits/estimate" -f $BaseUrl) $payload
    $step.status = $r.status
    $step.ms = $r.ms
    $step.body = Parse-JsonSafely $r.bodyRaw
    
    # Expected cost: 5 * 30 = 150
    $cost = if ($step.body.cost) { $step.body.cost } else { -1 }
    $step.ok = ($r.status -eq 200 -and $cost -eq 150)
    
    if ($step.ok) {
      Write-Success "Cost correct: 150 credits ($($step.body.display.usd))"
    } else {
      Write-Failure "Estimate failed (Got $cost, expected 150)"
    }
  } catch {
    $step.error = $_.Exception.Message
    Write-Failure $step.error
  }
  return $step
}

function Test-Pricing-Buy {
  $step = New-Result "pricing-buy"
  Write-Step "Buy Package (/api/credits/buy)"
  try {
    $payload = @{
      packageId = "starter"
      mock = $true
    }
    $r = Invoke-JsonPost ("{0}/api/credits/buy" -f $BaseUrl) $payload
    $step.status = $r.status
    $step.ms = $r.ms
    $step.body = Parse-JsonSafely $r.bodyRaw
    
    $added = if ($step.body.added) { $step.body.added } else { 0 }
    $step.ok = ($r.status -eq 200 -and $added -eq 500)
    
    if ($step.ok) {
      $script:initialBalance = $step.body.balance
      Write-Success "Bought 500 credits. Balance: $($script:initialBalance)"
    } else {
      Write-Failure "Buy package failed"
    }
  } catch {
    $step.error = $_.Exception.Message
    Write-Failure $step.error
  }
  return $step
}

function Test-Credits {
  $step = New-Result "credits"
  Write-Step "Check Credits (/api/credits)"
  try {
    $r = Invoke-JsonGet ("{0}/api/credits" -f $BaseUrl)
    $step.status = $r.status
    $step.ms = $r.ms
    $step.body = Parse-JsonSafely $r.bodyRaw
    $step.ok = ($r.status -eq 200 -and $step.body -ne $null)
    
    if ($step.ok) {
      $script:initialBalance = if ($step.body.balance) { $step.body.balance } else { 0 }
      Write-Success "Balance: $($script:initialBalance) credits"
    } else {
      Write-Failure "Credits check failed"
    }
  } catch {
    $step.error = $_.Exception.Message
    Write-Failure $step.error
  }
  return $step
}

function Test-PaymentFlow {
  $results = @()
  
  # Create Payment
  $step = New-Result "payment-create"
  Write-Step "Create PIX Payment (/api/payments/pix)"
  try {
    $payload = @{ amount = 10 }
    $r = Invoke-JsonPost ("{0}/api/payments/pix" -f $BaseUrl) $payload
    $step.status = $r.status
    $step.ms = $r.ms
    $step.body = Parse-JsonSafely $r.bodyRaw
    $step.ok = ($r.status -eq 200 -and $step.body -ne $null -and $step.body.paymentId)
    
    if ($step.ok) {
      $script:paymentId = $step.body.paymentId
      $isMock = $script:paymentId -match "^mock-"
      Write-Success "Payment created: $($script:paymentId) (Mock: $isMock)"
      if ($step.body.qrCode) { Write-Info "QR Code available" }
    } else {
      Write-Failure "Payment creation failed"
    }
  } catch {
    $step.error = $_.Exception.Message
    Write-Failure $step.error
  }
  $results += $step
  
  # Only test webhook for mock payments
  if ($script:paymentId -match "^mock-") {
    $step = New-Result "payment-confirm"
    Write-Step "Confirm Payment via Webhook (/api/payments/webhook)"
    try {
      $payload = @{ paymentId = $script:paymentId }
      $r = Invoke-JsonPost ("{0}/api/payments/webhook" -f $BaseUrl) $payload
      $step.status = $r.status
      $step.ms = $r.ms
      $step.body = Parse-JsonSafely $r.bodyRaw
      $step.ok = ($r.status -eq 200 -and $step.body.ok -eq $true)
      
      if ($step.ok) {
        Write-Success "Payment confirmed, credits added"
      } else {
        Write-Failure "Payment confirmation failed"
      }
    } catch {
      $step.error = $_.Exception.Message
      Write-Failure $step.error
    }
    $results += $step
    
    # Verify balance increased
    $step = New-Result "credits-verify"
    Write-Step "Verify Credits After Payment"
    try {
      $r = Invoke-JsonGet ("{0}/api/credits" -f $BaseUrl)
      $step.status = $r.status
      $step.ms = $r.ms
      $step.body = Parse-JsonSafely $r.bodyRaw
      $newBalance = if ($step.body.balance) { $step.body.balance } else { 0 }
      $expected = $script:initialBalance + 100
      $step.ok = ($r.status -eq 200 -and $newBalance -ge $expected)
      $step.details = "Before: $($script:initialBalance), After: $newBalance, Expected: >= $expected"
      
      if ($step.ok) {
        Write-Success "Balance increased: $($script:initialBalance) -> $newBalance"
      } else {
        Write-Failure "Balance mismatch (got $newBalance, expected >= $expected)"
      }
    } catch {
      $step.error = $_.Exception.Message
      Write-Failure $step.error
    }
    $results += $step
  } else {
    Write-Info "Skipping webhook test for real payment ID"
  }
  
  # Payment History
  $step = New-Result "payment-history"
  Write-Step "Check Payment History (/api/payments/history)"
  try {
    $r = Invoke-JsonGet ("{0}/api/payments/history" -f $BaseUrl)
    $step.status = $r.status
    $step.ms = $r.ms
    $step.body = Parse-JsonSafely $r.bodyRaw
    
    $found = $false
    if ($step.body.payments) {
      foreach ($p in $step.body.payments) {
        if ($p.paymentId -eq $script:paymentId) { 
          $found = $true
          $step.details = "Payment status: $($p.status)"
          break 
        }
      }
    }
    $step.ok = ($r.status -eq 200 -and $found)
    
    if ($step.ok) {
      Write-Success "Payment found in history"
    } else {
      Write-Failure "Payment not found in history"
    }
  } catch {
    $step.error = $_.Exception.Message
    Write-Failure $step.error
  }
  $results += $step
  
  return $results
}

function Test-RenderFlow([string]$projectId) {
  $results = @()
  
  # Create render config
  $step = New-Result "render-config"
  Write-Step "Create Render Config (/api/render/config)"
  try {
    $payload = @{
      projectId = $projectId
      format = "MP4"
      duration = 15
      scenesCount = 3
      aspectRatio = "16:9"
      quality = "720p"
    }
    $r = Invoke-JsonPost ("{0}/api/render/config" -f $BaseUrl) $payload
    $step.status = $r.status
    $step.ms = $r.ms
    $step.body = Parse-JsonSafely $r.bodyRaw
    $step.ok = ($r.status -eq 200 -and $step.body -ne $null -and $step.body.configId)
    
    if ($step.ok) {
      $script:configId = $step.body.configId
      Write-Success "Config created: $($script:configId) (Est: $($step.body.estimatedCredits) credits)"
    } else {
      Write-Failure "Config creation failed"
    }
  } catch {
    $step.error = $_.Exception.Message
    Write-Failure $step.error
  }
  $results += $step
  
  if (-not $step.ok) { return $results }
  
  # Start render with options
  $step = New-Result "render-start"
  Write-Step "Start Render (/api/render/pro)"
  try {
    $payload = @{
      projectId = $projectId
      configId = $script:configId
      renderOptions = @{
        format = "horizontal"
        watermark = $false
        crossfade = $true
        crossfadeDuration = 0.5
      }
    }
    $r = Invoke-JsonPost ("{0}/api/render/pro" -f $BaseUrl) $payload
    $step.status = $r.status
    $step.ms = $r.ms
    $step.body = Parse-JsonSafely $r.bodyRaw
    $step.ok = ($r.status -eq 200 -and $step.body -ne $null -and $step.body.renderId)
    
    if ($step.ok) {
      $script:renderId = $step.body.renderId
      Write-Success "Render started: $($script:renderId) (Cost: $($step.body.cost) credits)"
      Write-Info "Format: $($step.body.format)"
    } else {
      Write-Failure "Render start failed"
      if ($step.body.error) { Write-Info "Error: $($step.body.error)" }
    }
  } catch {
    $step.error = $_.Exception.Message
    Write-Failure $step.error
  }
  $results += $step
  
  if (-not $step.ok) { return $results }
  
  # Poll for completion
  $step = New-Result "render-poll"
  Write-Step "Poll Render Status (/api/render/status)"
  $maxAttempts = [Math]::Ceiling($RenderTimeout / 2)
  $lastProgress = 0
  
  try {
    for ($i = 0; $i -lt $maxAttempts; $i++) {
      Start-Sleep -Seconds 2
      $r = Invoke-JsonGet ("{0}/api/render/status?renderId={1}" -f $BaseUrl, $script:renderId)
      $step.status = $r.status
      $step.ms = $r.ms
      $step.body = Parse-JsonSafely $r.bodyRaw
      
      if ($step.body) {
        $progress = $step.body.progress
        $status = $step.body.status
        
        # Only print progress updates
        if ($progress -gt $lastProgress) {
          Write-Host "  Progress: $progress% (Status: $status)" -ForegroundColor Gray
          $lastProgress = $progress
        }
        
        if ($status -eq 'complete') {
          $step.ok = $true
          $step.details = "Completed in $($i * 2) seconds"
          Write-Success "Render complete!"
          if ($step.body.outputUrl) {
            Write-Info "Download: $($step.body.outputUrl)"
            $script:downloadUrl = $step.body.outputUrl
          }
          break
        }
        elseif ($status -eq 'failed') {
          $step.ok = $false
          $step.error = $step.body.error
          Write-Failure "Render failed: $($step.body.error)"
          break
        }
      }
    }
    
    if (-not $step.ok -and -not $step.error) {
      $step.error = "Timeout after $RenderTimeout seconds"
      Write-Failure $step.error
    }
  } catch {
    $step.error = $_.Exception.Message
    Write-Failure $step.error
  }
  $results += $step
  
  if (-not $step.ok) { return $results }
  
  # Test download
  $step = New-Result "render-download"
  Write-Step "Test Download (/api/render/download)"
  try {
    $downloadUrl = "{0}/api/render/download?jobId={1}" -f $BaseUrl, $script:renderId
    
    # Use HEAD request first to check headers
    $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Head, $downloadUrl)
    $resp = $client.SendAsync($request).GetAwaiter().GetResult()
    
    $step.status = [int]$resp.StatusCode
    $step.ok = ($resp.StatusCode -eq 200)
    
    $contentType = $resp.Content.Headers.ContentType
    $contentLength = $resp.Content.Headers.ContentLength
    
    $step.details = "Type: $contentType, Size: $contentLength bytes"
    
    if ($step.ok) {
      $sizeMB = [Math]::Round($contentLength / 1MB, 2)
      Write-Success "Download ready: $sizeMB MB ($contentType)"
    } else {
      Write-Failure "Download check failed"
    }
  } catch {
    $step.error = $_.Exception.Message
    Write-Failure $step.error
  }
  $results += $step
  
  # Test cleanup
  $step = New-Result "render-cleanup"
  Write-Step "Test Cleanup (DELETE /api/render/download)"
  try {
    $r = Invoke-JsonDelete ("{0}/api/render/download?jobId={1}" -f $BaseUrl, $script:renderId)
    $step.status = $r.status
    $step.ms = $r.ms
    $step.body = Parse-JsonSafely $r.bodyRaw
    $step.ok = ($r.status -eq 200 -and $step.body.ok -eq $true)
    
    if ($step.ok) {
      Write-Success "Render files cleaned up"
    } else {
      Write-Failure "Cleanup failed"
    }
  } catch {
    $step.error = $_.Exception.Message
    Write-Failure $step.error
  }
  $results += $step
  
  # Check render history
  $step = New-Result "render-history"
  Write-Step "Check Render History (/api/render/history)"
  try {
    $r = Invoke-JsonGet ("{0}/api/render/history?limit=10" -f $BaseUrl)
    $step.status = $r.status
    $step.ms = $r.ms
    $step.body = Parse-JsonSafely $r.bodyRaw
    $step.ok = ($r.status -eq 200 -and $step.body.renders)
    
    if ($step.ok) {
      $count = $step.body.renders.Count
      Write-Success "Found $count render(s) in history"
    } else {
      Write-Failure "History check failed"
    }
  } catch {
    $step.error = $_.Exception.Message
    Write-Failure $step.error
  }
  $results += $step
  
  return $results
}

#endregion

#region Main Execution

# Resolve token
if ([string]::IsNullOrWhiteSpace($Token)) {
  if ($UseJwt -and $env:JWT_OVERRIDE) { $Token = $env:JWT_OVERRIDE }
  elseif ($env:DEV_TOKEN) { $Token = $env:DEV_TOKEN }
  else { $Token = "dev-token" }
}

Set-AuthHeader $Token

# Print header
Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║              TM-IA Test Suite v2.0                         ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "  BaseUrl     : $BaseUrl" -ForegroundColor Gray
Write-Host "  Token       : $(Mask-Token $Token)" -ForegroundColor Gray
Write-Host "  Audio       : $AudioPath" -ForegroundColor Gray
Write-Host "  Mode        : $(if($UseJwt){'JWT'}else{'DEV'})" -ForegroundColor Gray
Write-Host "  RunRender   : $RunRender" -ForegroundColor Gray
Write-Host "  SkipPayment : $SkipPayment" -ForegroundColor Gray
Write-Host "  SkipDemo    : $SkipDemo" -ForegroundColor Gray
Write-Host ""

if (-not (Test-Path $AudioPath)) {
  Write-Host "ERROR: Audio file not found: $AudioPath" -ForegroundColor Red
  exit 1
}

# Initialize report
$run = [PSCustomObject]@{
  startedAt = NowIso
  baseUrl = $BaseUrl
  mode = $(if($UseJwt){"jwt"}else{"dev"})
  tokenMasked = Mask-Token $Token
  audioPath = $AudioPath
  options = @{
    runRender = $RunRender.IsPresent
    skipPayment = $SkipPayment.IsPresent
    skipDemo = $SkipDemo.IsPresent
    renderTimeout = $RenderTimeout
  }
  steps = @()
  outputs = @{}
  finishedAt = $null
  ok = $false
  summary = @{
    total = 0
    passed = 0
    failed = 0
  }
}

$stopProcessing = $false

# Script-level variables for cross-function communication
$script:uploadedFilePath = $null
$script:transcription = $null
$script:hookText = $null
$script:projectId = $null
$script:initialBalance = 0
$script:paymentId = $null
$script:configId = $null
$script:renderId = $null
$script:downloadUrl = $null

# Run tests
$run.steps += Test-Health
if (-not $run.steps[-1].ok) { $stopProcessing = $true }

if (-not $stopProcessing) {
  $run.steps += Test-Upload $AudioPath
  if (-not $run.steps[-1].ok) { $stopProcessing = $true }
}

if (-not $stopProcessing -and -not $SkipDemo) {
  $run.steps += Test-Transcribe $script:uploadedFilePath
  if (-not $run.steps[-1].ok) { $stopProcessing = $true }
  
  if (-not $stopProcessing) {
    $tx = if ($script:transcription) { $script:transcription } else { "test lyrics for hook generation" }
    $run.steps += Test-Hook $tx
    if (-not $run.steps[-1].ok) { $stopProcessing = $true }
  }
  
  if (-not $stopProcessing) {
    $hook = if ($script:hookText) { $script:hookText } else { "test hook" }
    $run.steps += Test-Preview $script:uploadedFilePath $hook
  }
}

if (-not $stopProcessing) {
  $run.steps += Test-CreateProject $script:uploadedFilePath
  if (-not $run.steps[-1].ok) { $stopProcessing = $true }
}

if (-not $stopProcessing) {
  $run.steps += Test-Credits
  $run.steps += Test-Pricing-Packages
  $run.steps += Test-Pricing-Estimate
  $run.steps += Test-Pricing-Buy
}

if (-not $stopProcessing -and -not $SkipPayment) {
  $paymentResults = Test-PaymentFlow
  $run.steps += $paymentResults
}

if (-not $stopProcessing -and $RunRender -and $script:projectId) {
  $renderResults = Test-RenderFlow $script:projectId
  $run.steps += $renderResults
}

# Finalize
$run.finishedAt = NowIso
$passed = ($run.steps | Where-Object { $_.ok }).Count
$failed = ($run.steps | Where-Object { -not $_.ok }).Count
$run.summary.total = $run.steps.Count
$run.summary.passed = $passed
$run.summary.failed = $failed
$run.ok = ($failed -eq 0)

# Store outputs
$run.outputs = @{
  uploadedFilePath = $script:uploadedFilePath
  projectId = $script:projectId
  paymentId = $script:paymentId
  renderId = $script:renderId
}

# Save JSON report
$run | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 "./test-report.json"

# Save Markdown report
$lines = @()
$lines += "# TM-IA Test Report"
$lines += ""
$lines += "## Summary"
$lines += ""
$lines += "| Metric | Value |"
$lines += "|--------|-------|"
$lines += "| Started | $($run.startedAt) |"
$lines += "| Finished | $($run.finishedAt) |"
$lines += "| BaseUrl | $($run.baseUrl) |"
$lines += "| Mode | $($run.mode) |"
$lines += "| **Total Tests** | $($run.summary.total) |"
$lines += "| **Passed** | $($run.summary.passed) |"
$lines += "| **Failed** | $($run.summary.failed) |"
$lines += "| **Result** | $(if($run.ok){'PASS'}else{'FAIL'}) |"
$lines += ""
$lines += "## Test Results"
$lines += ""
$lines += "| # | Test | Status | HTTP | Time (ms) | Details |"
$lines += "|--:|------|--------|------|----------:|---------|"

$i = 1
foreach ($s in $run.steps) {
  $statusIcon = if ($s.ok) { "✅" } else { "❌" }
  $details = if ($s.error) { $s.error -replace "\|","/" } elseif ($s.details) { $s.details } else { "" }
  $lines += "| $i | $($s.name) | $statusIcon | $($s.status) | $($s.ms) | $details |"
  $i++
}

$lines += ""
$lines += "## Outputs"
$lines += ""
$lines += "| Key | Value |"
$lines += "|-----|-------|"
$lines += "| Project ID | $($script:projectId) |"
$lines += "| Render ID | $($script:renderId) |"
$lines += "| Payment ID | $($script:paymentId) |"

$lines | Set-Content -Encoding UTF8 "./test-report.md"

# Print final summary
Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor $(if($run.ok){"Green"}else{"Red"})
Write-Host "║                      TEST SUMMARY                          ║" -ForegroundColor $(if($run.ok){"Green"}else{"Red"})
Write-Host "╠════════════════════════════════════════════════════════════╣" -ForegroundColor $(if($run.ok){"Green"}else{"Red"})
Write-Host ("║  Total: {0,3}  |  Passed: {1,3}  |  Failed: {2,3}              ║" -f $run.summary.total, $run.summary.passed, $run.summary.failed) -ForegroundColor $(if($run.ok){"Green"}else{"Red"})
Write-Host "╠════════════════════════════════════════════════════════════╣" -ForegroundColor $(if($run.ok){"Green"}else{"Red"})
Write-Host ("║                    RESULT: {0,-6}                          ║" -f $(if($run.ok){"PASS"}else{"FAIL"})) -ForegroundColor $(if($run.ok){"Green"}else{"Red"})
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor $(if($run.ok){"Green"}else{"Red"})
Write-Host ""
Write-Host "Reports saved: test-report.json / test-report.md" -ForegroundColor Gray
Write-Host ""

# Exit with appropriate code
exit $(if($run.ok){0}else{1})

#endregion
