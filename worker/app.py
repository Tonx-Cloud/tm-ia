import os
import shutil
import uuid
import subprocess
import requests
import base64
import re
from pathlib import Path
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from pydantic import BaseModel
from typing import List, Optional, Any, Dict
from faster_whisper import WhisperModel
import boto3

app = FastAPI()

# =========================
# Configuration
# =========================
MODEL_SIZE = os.getenv("WHISPER_MODEL", "small")
DEVICE = "cuda" if os.getenv("USE_GPU", "false").lower() == "true" else "cpu"
COMPUTE_TYPE = "float16" if DEVICE == "cuda" else "int8"

WORKER_TOKEN = os.getenv("RENDER_TOKEN") or os.getenv("ASR_TOKEN")
INTERNAL_SECRET = os.getenv("JWT_SECRET")  # used to call back into Vercel internal endpoints

R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID")
R2_BUCKET = os.getenv("R2_BUCKET")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_PUBLIC_BASE_URL = os.getenv("R2_PUBLIC_BASE_URL")

print(f"Loading Whisper model: {MODEL_SIZE} on {DEVICE}...")
try:
    model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE_TYPE, download_root="/tmp/models")
    print("Model loaded successfully.")
except Exception as e:
    print(f"Failed to load model: {e}")
    model = None


# =========================
# Models
# =========================
class TranscribeRequest(BaseModel):
    audioUrl: str
    language: str = "pt"
    model: str = "small"


class RenderRequest(BaseModel):
    userId: str
    renderId: str
    payloadUrl: str
    callbackUrl: str


# =========================
# Helpers
# =========================

def download_file(url: str, dest_path: Path, timeout_s: int = 120):
    with requests.get(url, stream=True, timeout=timeout_s) as r:
        r.raise_for_status()
        with open(dest_path, 'wb') as f:
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    f.write(chunk)
    return dest_path


def decode_dataurl_image(data_url: str, out_path: Path):
    m = re.match(r'^data:(image/[^;]+);base64,(.*)$', data_url, re.S)
    if not m:
        raise ValueError('bad dataUrl')
    out_path.write_bytes(base64.b64decode(m.group(2)))


def run(cmd: List[str], cwd: Optional[Path] = None) -> str:
    p = subprocess.run(cmd, cwd=str(cwd) if cwd else None, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    if p.returncode != 0:
        raise RuntimeError(p.stdout[-2000:])
    return p.stdout


def r2_client():
    if not (R2_ACCOUNT_ID and R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY):
        raise RuntimeError('R2 env not configured on worker')
    return boto3.client(
        's3',
        endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        region_name='auto',
    )


def r2_public_url(key: str) -> str:
    if not R2_PUBLIC_BASE_URL:
        raise RuntimeError('R2_PUBLIC_BASE_URL missing')
    return R2_PUBLIC_BASE_URL.rstrip('/') + '/' + key


def call_callback(callback_url: str, payload: Dict[str, Any]):
    if not INTERNAL_SECRET:
        print('WARNING: INTERNAL_SECRET (JWT_SECRET) missing; cannot callback')
        return
    try:
        requests.post(
            callback_url,
            json=payload,
            headers={'x-internal-render-secret': INTERNAL_SECRET},
            timeout=30,
        )
    except Exception as e:
        print(f"Callback failed: {e}")


# =========================
# Endpoints
# =========================
@app.get("/health")
def health():
    return {"status": "ok", "device": DEVICE, "model_loaded": model is not None}


@app.post("/transcribe")
async def transcribe(req: TranscribeRequest, request: Request):
    if WORKER_TOKEN:
        auth = request.headers.get('authorization') or ''
        if auth != f"Bearer {WORKER_TOKEN}":
            raise HTTPException(status_code=401, detail='Unauthorized')

    if not model:
        raise HTTPException(status_code=500, detail="Whisper model not initialized")

    tmp_id = str(uuid.uuid4())
    tmp_dir = Path("/tmp/work") / tmp_id
    tmp_dir.mkdir(parents=True, exist_ok=True)
    audio_path = tmp_dir / "audio.mp3"

    try:
        print(f"Downloading audio from {req.audioUrl}...")
        download_file(req.audioUrl, audio_path)

        print("Transcribing...")
        segments, info = model.transcribe(str(audio_path), language=req.language)

        results = []
        full_text = []
        for segment in segments:
            results.append({"start": segment.start, "end": segment.end, "text": segment.text.strip()})
            full_text.append(segment.text.strip())

        return {"language": info.language, "duration": info.duration, "text": " ".join(full_text), "segments": results}

    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


@app.post("/render")
async def render(req: RenderRequest, background_tasks: BackgroundTasks, request: Request):
    # Worker auth
    if WORKER_TOKEN:
        auth = request.headers.get('authorization') or ''
        if auth != f"Bearer {WORKER_TOKEN}":
            raise HTTPException(status_code=401, detail='Unauthorized')

    if not INTERNAL_SECRET:
        raise HTTPException(status_code=500, detail='JWT_SECRET not configured on worker')

    background_tasks.add_task(_do_render, req.userId, req.renderId, req.payloadUrl, req.callbackUrl)
    return {"status": "queued", "renderId": req.renderId}


# =========================
# Render implementation
# =========================

def _do_render(user_id: str, render_id: str, payload_url: str, callback_url: str):
    tmp_dir = Path('/tmp/work') / f'render_{render_id}'
    shutil.rmtree(tmp_dir, ignore_errors=True)
    tmp_dir.mkdir(parents=True, exist_ok=True)

    try:
        # Fetch payload from Vercel
        resp = requests.post(
            payload_url,
            json={'userId': user_id, 'renderId': render_id},
            headers={'x-internal-render-secret': INTERNAL_SECRET},
            timeout=60,
        )
        resp.raise_for_status()
        payload = resp.json()

        audio_url = payload.get('audioUrl')
        if not audio_url:
            raise RuntimeError('payload.audioUrl missing')

        storyboard = payload.get('storyboard') or []
        assets_list = payload.get('assets') or []
        assets = {a['id']: a for a in assets_list if a.get('id')}

        # Download audio
        audio_path = tmp_dir / 'audio.bin'
        download_file(audio_url, audio_path, timeout_s=180)

        # Render settings
        fps = 30
        format_ = 'horizontal'
        # resolution
        res = {'horizontal': (1920, 1080), 'vertical': (1080, 1920), 'square': (1080, 1080)}[format_]
        w, h = res

        clips = []
        for i, item in enumerate(storyboard):
            aid = item.get('assetId')
            if not aid or aid not in assets:
                continue
            a = assets[aid]

            dur = float(item.get('durationSec') or 5)
            anim = str(item.get('animateType') or item.get('animation') or ('zoom-in' if item.get('animate') else 'none'))

            # Prefer completed video if present
            anim_obj = a.get('animation') or None
            video_url = None
            if anim_obj and anim_obj.get('status') == 'completed':
                video_url = anim_obj.get('videoUrl')

            out_clip = tmp_dir / f'clip_{i:03d}.mp4'

            base = f"scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1"

            if video_url and isinstance(video_url, str) and video_url.startswith('http'):
                src_vid = tmp_dir / f'src_{i:03d}.mp4'
                download_file(video_url, src_vid, timeout_s=300)
                vf = base + f",fps={fps}"
                cmd = [
                    'ffmpeg', '-y',
                    '-stream_loop', '-1', '-i', str(src_vid),
                    '-t', f"{dur:.2f}",
                    '-vf', vf,
                    '-an',
                    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                    str(out_clip)
                ]
                run(cmd)
            else:
                data_url = a.get('dataUrl')
                if not data_url:
                    continue
                img = tmp_dir / f'src_{i:03d}.png'
                decode_dataurl_image(data_url, img)

                frames = max(1, round(dur * fps))
                den = max(1, frames - 1)
                sizeStr = f"s={w}x{h}"

                vf = base + f",fps={fps}"
                # Tune: make pan more visible
                pan_zoom = 1.15

                if anim == 'zoom-in':
                    maxZoom = 1.25
                    z = f"min(1+({maxZoom}-1)*on/{den},{maxZoom})"
                    vf += f",zoompan=z='{z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:{sizeStr},fps={fps}"
                elif anim == 'zoom-out':
                    maxZoom = 1.25
                    z = f"max({maxZoom}-({maxZoom}-1)*on/{den},1.0)"
                    vf += f",zoompan=z='{z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:{sizeStr},fps={fps}"
                elif anim == 'pan-left':
                    vf += f",zoompan=z='{pan_zoom}':x='(iw-ow)*on/{den}':y='(ih-oh)/2':d=1:{sizeStr},fps={fps}"
                elif anim == 'pan-right':
                    vf += f",zoompan=z='{pan_zoom}':x='(iw-ow)*(1-on/{den})':y='(ih-oh)/2':d=1:{sizeStr},fps={fps}"
                elif anim == 'pan-up':
                    vf += f",zoompan=z='{pan_zoom}':x='(iw-ow)/2':y='(ih-oh)*(1-on/{den})':d=1:{sizeStr},fps={fps}"
                elif anim == 'pan-down':
                    vf += f",zoompan=z='{pan_zoom}':x='(iw-ow)/2':y='(ih-oh)*on/{den}':d=1:{sizeStr},fps={fps}"
                elif anim == 'fade-in':
                    vf += ",fade=t=in:st=0:d=0.5"
                elif anim == 'fade-out':
                    st = max(0.0, dur - 0.5)
                    vf += f",fade=t=out:st={st:.2f}:d=0.5"

                cmd = [
                    'ffmpeg', '-y',
                    '-framerate', str(fps),
                    '-loop', '1', '-t', f"{dur:.2f}", '-i', str(img),
                    '-vf', vf,
                    '-r', str(fps),
                    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                    str(out_clip)
                ]
                run(cmd)

            clips.append(out_clip)

        if not clips:
            raise RuntimeError('no clips generated')

        out_mp4 = tmp_dir / 'output.mp4'
        inputs = []
        for c in clips:
            inputs += ['-i', str(c)]
        inputs += ['-i', str(audio_path)]

        vIns = ''.join([f'[{i}:v]' for i in range(len(clips))])
        fc = f"{vIns}concat=n={len(clips)}:v=1:a=0,setpts=N/{fps}/TB,fps={fps}[v]"

        cmd = [
            'ffmpeg', '-y', *inputs,
            '-filter_complex', fc,
            '-map', '[v]', '-map', f"{len(clips)}:a:0",
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', str(fps),
            '-c:a', 'aac', '-b:a', '192k',
            '-shortest', '-movflags', '+faststart',
            '-video_track_timescale', '15360',
            str(out_mp4)
        ]
        run(cmd)

        # Probe
        probe = run(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=r_frame_rate,avg_frame_rate,time_base','-of','default=nk=1:nw=1', str(out_mp4)])

        # Upload to R2
        key = f"renders/{payload.get('projectId')}/{render_id}.mp4"
        client = r2_client()
        client.upload_file(str(out_mp4), R2_BUCKET, key, ExtraArgs={'ContentType': 'video/mp4'})
        url = r2_public_url(key)

        call_callback(callback_url, {
            'userId': user_id,
            'renderId': render_id,
            'status': 'complete',
            'outputUrl': url,
            'logTail': 'VM worker render complete\n' + probe.strip(),
        })

    except Exception as e:
        call_callback(callback_url, {
            'userId': user_id,
            'renderId': render_id,
            'status': 'failed',
            'error': str(e),
            'logTail': 'VM worker render failed: ' + str(e),
        })
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
