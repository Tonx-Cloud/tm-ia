param(
  [string]$AudioPath = "test.mp3",
  [string]$OutPath = "./out-local-anim.mp4",
  [int]$Width = 1920,
  [int]$Height = 1080,
  [int]$Fps = 30,
  [double]$Duration = 10,
  [double]$MaxZoom = 1.20,
  [switch]$KeepTemp
)

$ErrorActionPreference = 'Stop'

function Require-Cmd($name) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if (-not $cmd) { throw "Missing command: $name (install ffmpeg and ensure it's in PATH)" }
}

Require-Cmd ffmpeg
Require-Cmd ffprobe

if (-not (Test-Path $AudioPath)) { throw "Audio file not found: $AudioPath" }

$audioDur = (& ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 $AudioPath) -as [double]
if (-not $audioDur -or $audioDur -le 0) { $audioDur = $Duration }
$dur = [Math]::Min($Duration, $audioDur)

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("tmia_anim_" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

try {
  Write-Host "Temp dir: $tmp"
  Write-Host "Audio: $AudioPath (dur used: $dur sec)"

  # Generate 3 synthetic images locally (so we don't depend on DB/R2)
  # Use test patterns so zoom is visually measurable (solid colors won't show zoom).
  $img1 = Join-Path $tmp 'img1.png'
  $img2 = Join-Path $tmp 'img2.png'
  $img3 = Join-Path $tmp 'img3.png'

  & ffmpeg -hide_banner -loglevel error -y -f lavfi -i "testsrc2=s=${Width}x${Height}:r=$Fps" -frames:v 1 $img1
  & ffmpeg -hide_banner -loglevel error -y -f lavfi -i "testsrc2=s=${Width}x${Height}:r=$Fps,eq=contrast=1.2:saturation=1.3" -frames:v 1 $img2
  & ffmpeg -hide_banner -loglevel error -y -f lavfi -i "testsrc2=s=${Width}x${Height}:r=$Fps,hue=h=60" -frames:v 1 $img3

  $sceneDur = [Math]::Round($dur / 3.0, 2)
  $frames = [Math]::Max(1, [int][Math]::Round($sceneDur * $Fps))
  $sizeStr = "s=${Width}x${Height}"

  $clip1 = Join-Path $tmp 'clip_001.mp4'
  $clip2 = Join-Path $tmp 'clip_002.mp4'
  $clip3 = Join-Path $tmp 'clip_003.mp4'

  # IMPORTANT:
  # - We force input framerate (-framerate) AND output framerate (-r) to avoid 25fps defaults.
  # - Use zoompan with noticeable step so it's obvious even on mobile.
  $scale = "scale=${Width}:${Height}:force_original_aspect_ratio=decrease,pad=${Width}:${Height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=${Fps}"

  # Some ffmpeg builds are picky about zoompan options; keep it simple and apply fps as a separate filter.
  # IMPORTANT: when the input is a looped still image, ffmpeg will produce many input frames.
  # If we set zoompan d=<frames>, it multiplies frames and can create huge clips.
  # So we drive zoom based on output frame index (on) and keep d=1.
  $den = [Math]::Max(1, $frames - 1)
  # on goes from 0..(frames-1), so this reaches exactly MaxZoom on the last frame (no min()/comma needed)
  $zoomExpr = "1+(${MaxZoom}-1)*on/$den"
  $vfZoom = "$scale,zoompan=z='$zoomExpr':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:$sizeStr,fps=$Fps,scale=${Width}:${Height}"
  $vfNone = "$scale,fps=$Fps,scale=${Width}:${Height}"

  & ffmpeg -hide_banner -loglevel error -y -framerate $Fps -loop 1 -t $sceneDur -i $img1 -vf $vfZoom -r $Fps -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p $clip1
  & ffmpeg -hide_banner -loglevel error -y -framerate $Fps -loop 1 -t $sceneDur -i $img2 -vf $vfZoom -r $Fps -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p $clip2
  & ffmpeg -hide_banner -loglevel error -y -framerate $Fps -loop 1 -t $sceneDur -i $img3 -vf $vfNone -r $Fps -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p $clip3

  $concat = Join-Path $tmp 'concat.txt'
  @(
    "file '$clip1'",
    "file '$clip2'",
    "file '$clip3'"
  ) | Set-Content -Path $concat

  # Mux with audio
  & ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i $concat -i $AudioPath -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart $OutPath

  Write-Host "\nOK: $OutPath"

  # Quick verification: dump 2 frames from first scene; hashes should differ if zoom is working
  $f1 = Join-Path $tmp 'frame_0_5.png'
  $f2 = Join-Path $tmp 'frame_2_5.png'
  & ffmpeg -hide_banner -loglevel error -y -ss 0.5 -i $OutPath -frames:v 1 $f1
  & ffmpeg -hide_banner -loglevel error -y -ss 2.5 -i $OutPath -frames:v 1 $f2

  Write-Host "\nFrame hashes (should be different if there is motion):"
  $h1 = (& certutil -hashfile $f1 SHA256 | Select-String -Pattern '^[0-9a-f]{64}$').ToString().Trim()
  $h2 = (& certutil -hashfile $f2 SHA256 | Select-String -Pattern '^[0-9a-f]{64}$').ToString().Trim()
  Write-Host $h1
  Write-Host $h2
  if ($h1 -eq $h2) { throw "Animation check failed: frame hashes are identical (no visible motion)" }

} finally {
  if ($KeepTemp) {
    Write-Host "Keeping temp dir: $tmp"
  } else {
    try { Remove-Item -Recurse -Force $tmp } catch {}
  }
}
