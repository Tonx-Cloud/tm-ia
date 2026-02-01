import os
import time
from faster_whisper import WhisperModel

AUDIO_PATH = r"D:\tm-ia\test.mp3"
MODEL_SIZE = "tiny" # Use tiny for fast local test
DEVICE = "cpu"
COMPUTE_TYPE = "int8"

def main():
    if not os.path.exists(AUDIO_PATH):
        print(f"Error: File not found: {AUDIO_PATH}")
        return

    print(f"Loading model {MODEL_SIZE} on {DEVICE}...")
    start_load = time.time()
    model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE_TYPE)
    print(f"Model loaded in {time.time() - start_load:.2f}s")

    print(f"Transcribing {AUDIO_PATH}...")
    start_transcribe = time.time()
    segments, info = model.transcribe(AUDIO_PATH, language="pt")

    print(f"Detected language: {info.language} with probability {info.language_probability:.2f}")
    
    segment_count = 0
    full_text = []
    for segment in segments:
        segment_count += 1
        print(f"[{segment.start:.2f}s -> {segment.end:.2f}s] {segment.text}")
        full_text.append(segment.text)

    print(f"Transcription finished in {time.time() - start_transcribe:.2f}s")
    print(f"Total segments: {segment_count}")
    print("-" * 40)
    print("Full Text Preview:")
    print(" ".join(full_text)[:500] + "...")

if __name__ == "__main__":
    main()
