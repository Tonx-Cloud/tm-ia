import os
import shutil
import uuid
import subprocess
import requests
import json
from pathlib import Path
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from pydantic import BaseModel
from typing import List, Optional
from faster_whisper import WhisperModel

app = FastAPI()

# Configuration
MODEL_SIZE = os.getenv("WHISPER_MODEL", "small")
DEVICE = "cuda" if os.getenv("USE_GPU", "false").lower() == "true" else "cpu"
COMPUTE_TYPE = "float16" if DEVICE == "cuda" else "int8"

print(f"Loading Whisper model: {MODEL_SIZE} on {DEVICE}...")
try:
    model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE_TYPE, download_root="/tmp/models")
    print("Model loaded successfully.")
except Exception as e:
    print(f"Failed to load model: {e}")
    model = None

class TranscribeRequest(BaseModel):
    audioUrl: str
    language: str = "pt"
    model: str = "small"

class RenderAsset(BaseModel):
    id: str
    url: str
    type: str # 'image' | 'video'
    duration: float

class RenderRequest(BaseModel):
    renderId: str
    audioUrl: str
    assets: List[RenderAsset]
    format: str = "vertical" # vertical, horizontal, square
    callbackUrl: Optional[str] = None

def download_file(url: str, dest_path: Path):
    with requests.get(url, stream=True) as r:
        r.raise_for_status()
        with open(dest_path, 'wb') as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
    return dest_path

@app.get("/health")
def health():
    return {"status": "ok", "device": DEVICE, "model_loaded": model is not None}

@app.post("/transcribe")
async def transcribe(req: TranscribeRequest):
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
        
        # Collect segments
        results = []
        full_text = []
        for segment in segments:
            results.append({
                "start": segment.start,
                "end": segment.end,
                "text": segment.text.strip()
            })
            full_text.append(segment.text.strip())
            
        return {
            "language": info.language,
            "duration": info.duration,
            "text": " ".join(full_text),
            "segments": results
        }

    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

# TODO: Implement /render endpoint calling FFmpeg
@app.post("/render")
async def render(req: RenderRequest, background_tasks: BackgroundTasks):
    # Placeholder for render logic
    # Real implementation would download assets, build complex filter_complex, run ffmpeg, upload result
    return {"status": "queued", "renderId": req.renderId, "message": "Rendering not fully implemented in worker yet"}
