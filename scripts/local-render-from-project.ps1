param(
  [Parameter(Mandatory=$true)][string]$ProjectId,
  [string]$BaseUrl = "https://tm-ia.vercel.app",
  [string]$Email = "hiltonsf+smoke@gmail.com",
  [string]$Password = "xwdvaqQBYxIjmtM0L9zkrP!Aa1",
  [string]$OutPath = "./out-local-from-project.mp4",
  [int]$Fps = 30,
  [double]$MaxZoom = 1.20,
  [switch]$KeepTemp
)

$ErrorActionPreference = 'Stop'

function Require-Cmd($name) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if (-not $cmd) { throw "Missing command: $name (install ffmpeg and ensure it's in PATH)" }
}

function PostJson($url, $obj, $token=$null) {
  $headers=@{ 'Content-Type'='application/json' }
  if($token){ $headers.Authorization = "Bearer $token" }
  Invoke-RestMethod -Uri $url -Method POST -Headers $headers -Body ($obj | ConvertTo-Json -Depth 20)
}

Require-Cmd ffmpeg
Require-Cmd ffprobe

# Auth
$Token = (PostJson "$BaseUrl/api/auth/login" @{ email=$Email; password=$Password }).token
if(-not $Token){ throw "Login failed (no token)" }

# Fetch project (via assets endpoint)
$proj = Invoke-RestMethod -Uri "$BaseUrl/api/assets?projectId=$ProjectId" -Headers @{ Authorization = "Bearer $Token" }
$project = $proj.project
if(-not $project){ throw "Project not found or unauthorized" }

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("tmia_render_project_" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

try {
  Write-Host "Temp dir: $tmp"
  Write-Host "ProjectId: $ProjectId"

  # Download audio
  $audioUrl = $project.audioUrl
  if(-not $audioUrl){ throw "project.audioUrl missing" }
  $audioPath = Join-Path $tmp 'audio.mp3'
  Invoke-WebRequest -UseBasicParsing -Uri $audioUrl -OutFile $audioPath

  $audioDur = (& ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 $audioPath) -as [double]
  if (-not $audioDur -or $audioDur -le 0) { throw "Could not read audio duration" }

  # Map assets by id
  $assetsById = @{}
  foreach($a in $project.assets){ $assetsById[$a.id] = $a }

  # Resolve storyboard
  $sb = @($project.storyboard)
  if(-not $sb -or $sb.Count -eq 0){ throw "project.storyboard missing/empty" }

  # Render options
  $W=1920; $H=1080
  $sizeStr = "s=${W}x${H}"
  $scale = "scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=${Fps}"

  $concat = Join-Path $tmp 'concat.txt'
  $concatLines = @()

  for($i=0; $i -lt $sb.Count; $i++){
    $item = $sb[$i]
    $assetId = $item.assetId
    $dur = [double]$item.durationSec
    if(-not $dur -or $dur -le 0){ throw "Storyboard item durationSec invalid at index $i" }

    $anim = $item.animation
    if(-not $anim){ $anim = 'none' }

    $asset = $assetsById[$assetId]
    if(-not $asset){ throw "Asset not found for storyboard assetId=$assetId" }

    # Decode dataUrl -> png
    $dataUrl = $asset.dataUrl
    if(-not $dataUrl){ throw "Asset $assetId missing dataUrl" }
    if($dataUrl -notmatch '^data:image/\w+;base64,'){ throw "Asset $assetId dataUrl is not base64 image" }
    $b64 = $dataUrl.Substring($dataUrl.IndexOf(',')+1)
    $imgPath = Join-Path $tmp ("img_{0:000}.png" -f ($i+1))
    [System.IO.File]::WriteAllBytes($imgPath, [Convert]::FromBase64String($b64))

    $clipPath = Join-Path $tmp ("clip_{0:000}.mp4" -f ($i+1))

    $frames = [Math]::Max(1, [int][Math]::Round($dur * $Fps))

    if($anim -eq 'zoom-in'){
      $den = [Math]::Max(1, $frames - 1)
      $zoomExpr = "1+(${MaxZoom}-1)*on/$den"
      $vf = "$scale,zoompan=z='$zoomExpr':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:$sizeStr,fps=$Fps,scale=${W}:${H}"
    } elseif($anim -eq 'none'){
      $vf = "$scale,fps=$Fps,scale=${W}:${H}"
    } else {
      # Fallback: treat unknown as none for this local comparison script
      $vf = "$scale,fps=$Fps,scale=${W}:${H}"
    }

    & ffmpeg -hide_banner -loglevel error -y -framerate $Fps -loop 1 -t $dur -i $imgPath -vf $vf -r $Fps -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p $clipPath

    $concatLines += "file '$clipPath'"
  }

  $concatLines | Set-Content -Path $concat

  # Mux with audio (copy video, encode audio)
  & ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i $concat -i $audioPath -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart $OutPath

  Write-Host "\nOK: $OutPath"

  # Verification: hashes from early and later frame should differ for zoom-in scene
  $f1 = Join-Path $tmp 'frame_0_5.png'
  $f2 = Join-Path $tmp 'frame_2_5.png'
  & ffmpeg -hide_banner -loglevel error -y -ss 0.5 -i $OutPath -frames:v 1 $f1
  & ffmpeg -hide_banner -loglevel error -y -ss 2.5 -i $OutPath -frames:v 1 $f2
  $h1 = (& certutil -hashfile $f1 SHA256 | Select-String -Pattern '^[0-9a-f]{64}$').ToString().Trim()
  $h2 = (& certutil -hashfile $f2 SHA256 | Select-String -Pattern '^[0-9a-f]{64}$').ToString().Trim()
  Write-Host "Frame hashes (0.5s vs 2.5s):"
  Write-Host $h1
  Write-Host $h2
  if($h1 -eq $h2){ throw "Animation check failed: identical frame hashes" }

} finally {
  if($KeepTemp){
    Write-Host "Keeping temp dir: $tmp"
  } else {
    try { Remove-Item -Recurse -Force $tmp } catch {}
  }
}
