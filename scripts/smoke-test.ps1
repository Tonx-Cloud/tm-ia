param(
  [string]$BaseUrl = "http://localhost:5173",
  [string]$ApiBase = "",
  [string]$Token = "",
  [string]$ProjectId = "",
  [string]$EnvFile = ".env.local",
  [string]$AudioPath = "test.mp3"
)

$ErrorActionPreference = "Stop"

function Write-Section($title) {
  Write-Host "`n=== $title ==="
}

function Load-EnvFile($path) {
  if (-not (Test-Path $path)) { return 0 }
  $count = 0
  Get-Content $path | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    $parts = $_ -split '=', 2
    if ($parts.Count -lt 2) { return }
    $key = $parts[0].Trim().Trim([char]0xFEFF).Trim('"')
    $val = $parts[1].Trim().Trim([char]0xFEFF).Trim('"')
    [Environment]::SetEnvironmentVariable($key, $val, 'Process')
    $count++
  }
  return $count
}

function Require-Env($name) {
  $value = [Environment]::GetEnvironmentVariable($name, 'Process')
  if (-not $value) {
    Write-Warning "Missing env var: $name"
    return $false
  }
  return $true
}

function Assert-File($path) {
  if (-not (Test-Path $path)) {
    Write-Warning "Missing file: $path"
    return $false
  }
  return $true
}

function Try-Json($raw) {
  try { return $raw | ConvertFrom-Json } catch { return $null }
}

function Post-Json($url, $jsonBody) {
  Add-Type -AssemblyName System.Net.Http
  $client = New-Object System.Net.Http.HttpClient
  try {
    $content = New-Object System.Net.Http.StringContent($jsonBody, [System.Text.Encoding]::UTF8, "application/json")
    $resp = $client.PostAsync($url, $content).Result
    $raw = $resp.Content.ReadAsStringAsync().Result
    return @{ StatusCode = [int]$resp.StatusCode; Raw = $raw }
  } finally {
    $client.Dispose()
  }
}

Write-Section "Smoke Test"
Write-Host "BaseUrl: $BaseUrl"
Write-Host "ApiBase: $ApiBase"

# Load env file if provided (helps local runs)
if ($EnvFile) {
  $loaded = Load-EnvFile $EnvFile
  Write-Host "EnvFile loaded vars: $loaded"
}

$envOk = $true
$envOk = (Require-Env "SMOKE_EMAIL") -and $envOk
$envOk = (Require-Env "SMOKE_PASSWORD") -and $envOk
$envOk = (Assert-File $AudioPath) -and $envOk

if (-not $envOk) {
  Write-Warning "Env/arquivos incompletos. Smoke test completo nao pode ser executado."
  Write-Host "Configure env vars/arquivos e rode novamente."
  exit 1
}

if (-not $ApiBase) {
  $ApiBase = $BaseUrl
}

# --- Auth ---
Write-Section "Auth"
if (-not $Token) {
  $email = [Environment]::GetEnvironmentVariable('SMOKE_EMAIL', 'Process')
  $password = [Environment]::GetEnvironmentVariable('SMOKE_PASSWORD', 'Process')

  $loginBody = @{ email = $email; password = $password } | ConvertTo-Json
  $regBody = $loginBody

  $login = Post-Json "$ApiBase/api/auth/login" $loginBody
  $loginJson = Try-Json $login.Raw

  if ($login.StatusCode -ge 200 -and $login.StatusCode -lt 300) {
    $Token = $loginJson.token
    Write-Host "Login: OK"
  } else {
    Write-Warning "Login falhou ($($login.StatusCode)), tentando registrar..."

    $reg = Post-Json "$ApiBase/api/auth/register" $regBody
    $regJson = Try-Json $reg.Raw

    if ($reg.StatusCode -ge 200 -and $reg.StatusCode -lt 300 -and $regJson.token) {
      $Token = $regJson.token
      Write-Host "Register: OK (token retornado)"
    } else {
      if ($reg.Raw) {
        Write-Warning "Register falhou ($($reg.StatusCode)): $($reg.Raw)"
      } else {
        Write-Warning "Register falhou ($($reg.StatusCode)) sem body"
      }

      Write-Warning "Tentando login novamente..."
      $login2 = Post-Json "$ApiBase/api/auth/login" $loginBody
      $login2Json = Try-Json $login2.Raw
      if ($login2.StatusCode -ge 200 -and $login2.StatusCode -lt 300) {
        $Token = $login2Json.token
        Write-Host "Login apos registro: OK"
      } else {
        if ($login2.Raw) {
          Write-Warning "Login apos registro falhou ($($login2.StatusCode)): $($login2.Raw)"
        } else {
          Write-Warning "Login apos registro falhou ($($login2.StatusCode)) sem body"
        }
        exit 1
      }
    }
  }
}

if (-not $Token) {
  Write-Warning "Token nao obtido."
  Write-Warning "Em produção, contas email/senha podem exigir confirmação. Use um email já confirmado para o smoke test."
  exit 1
}

# --- Credits (ensure VIP top-up) ---
Write-Section "Credits"
try {
  $credits = Invoke-RestMethod -Uri "$ApiBase/api/credits" -Method GET -Headers @{ Authorization = "Bearer $Token" }
  Write-Host "Credits: OK (balance=$($credits.balance))"
} catch {
  Write-Warning "Credits falhou: $($_.Exception.Message)"
  exit 1
}

# --- Analyze (upload) ---
Write-Section "Analyze"
try {
  Add-Type -AssemblyName System.Net.Http
  $client = New-Object System.Net.Http.HttpClient
  $client.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $Token)

  $multipart = New-Object System.Net.Http.MultipartFormDataContent
  $fs = [System.IO.File]::OpenRead($AudioPath)
  $fileContent = New-Object System.Net.Http.StreamContent($fs)
  $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("audio/mpeg")
  $multipart.Add($fileContent, "audio", [System.IO.Path]::GetFileName($AudioPath))
  $multipart.Add((New-Object System.Net.Http.StringContent("60")), "durationSeconds")

  $response = $client.PostAsync("$ApiBase/api/demo/analyze", $multipart).Result
  $raw = $response.Content.ReadAsStringAsync().Result
  if (-not $response.IsSuccessStatusCode) {
    Write-Warning "Analyze falhou: $raw"
    exit 1
  }

  $analyze = $raw | ConvertFrom-Json
  $ProjectId = $analyze.projectId
  Write-Host "Analyze: OK (projectId=$ProjectId)"
} finally {
  if ($fs) { $fs.Close() }
  if ($client) { $client.Dispose() }
}

if (-not $ProjectId) {
  Write-Warning "projectId nao encontrado"
  exit 1
}

# --- Generate scenes ---
Write-Section "Generate"
$segments = @(
  @{ startTime = 0; endTime = 10; text = "Smoke test" }
)

$genBody = @{
  projectId = $ProjectId
  segments = $segments
  style = "cinematic"
  mood = $analyze.mood
  genre = $analyze.genre
  aspectRatio = "16:9"
  frequency = 5
  generationMode = "full"
} | ConvertTo-Json -Depth 5

try {
  $gen = Invoke-RestMethod -Uri "$ApiBase/api/assets/generate" -Method POST -Headers @{ Authorization = "Bearer $Token"; "Content-Type" = "application/json" } -Body $genBody
  Write-Host "Generate: OK (added=$($gen.added))"
} catch {
  Write-Warning "Generate falhou: $($_.Exception.Message)"
  exit 1
}

# --- Render ---
Write-Section "Render"
$renderBody = @{
  projectId = $ProjectId
  config = @{
    duration = 10
    quality = "standard"
    scenesCount = 3
    aspectRatio = "16:9"
  }
  renderOptions = @{
    watermark = $false
    crossfade = $false
    crossfadeDuration = 0.5
  }
} | ConvertTo-Json -Depth 5

try {
  $render = Invoke-RestMethod -Uri "$ApiBase/api/render/pro" -Method POST -Headers @{ Authorization = "Bearer $Token"; "Content-Type" = "application/json" } -Body $renderBody
  $renderId = $render.renderId
  Write-Host "Render: OK (renderId=$renderId)"
} catch {
  Write-Warning "Render falhou: $($_.Exception.Message)"
  exit 1
}

# --- Render status polling ---
Write-Section "Render Status"
$maxAttempts = 30
$attempt = 0
while ($attempt -lt $maxAttempts) {
  $attempt++
  try {
    $status = Invoke-RestMethod -Uri "$ApiBase/api/render/status?renderId=$renderId" -Method GET -Headers @{ Authorization = "Bearer $Token" }
    Write-Host "Status: $($status.status) progress=$($status.progress)"
    if ($status.status -eq "complete") {
      Write-Host "Output: $($status.outputUrl)"
      break
    }
    if ($status.status -eq "failed") {
      Write-Warning "Render failed: $($status.error)"
      exit 1
    }
  } catch {
    Write-Warning "Status check falhou: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds 10
}

if ($attempt -ge $maxAttempts) {
  Write-Warning "Timeout aguardando render"
  exit 1
}

Write-Host "`nSmoke test finalizado."
