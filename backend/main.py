from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
import os
from dotenv import load_dotenv
import io
import soundfile as sf
from kokoro import KPipeline
from groq import Groq

load_dotenv()

app = FastAPI()

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Kokoro TTS pipeline
try:
    tts_pipeline = KPipeline(lang_code='a')  # 'a' for American English
    print("✓ Kokoro TTS initialized successfully")
except Exception as e:
    print(f"⚠ Warning: Kokoro TTS failed to initialize: {e}")
    tts_pipeline = None

# Initialize Groq client
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))


class TTSRequest(BaseModel):
    text: str
    voice: str = "af_heart"  # Default voice


@app.get("/")
async def root():
    return {
        "status": "online",
        "tts": "kokoro" if tts_pipeline else "unavailable",
        "stt": "groq-whisper"
    }


@app.post("/api/tts")
async def text_to_speech(request: TTSRequest):
    """Convert text to speech using Kokoro TTS"""
    if not tts_pipeline:
        raise HTTPException(status_code=503, detail="TTS service not available")

    try:
        # Generate audio
        generator = tts_pipeline(request.text, voice=request.voice)

        # Collect all audio chunks
        audio_chunks = []
        for _, _, audio in generator:
            audio_chunks.append(audio)

        if not audio_chunks:
            raise HTTPException(status_code=500, detail="No audio generated")

        # Concatenate audio chunks
        import numpy as np
        full_audio = np.concatenate(audio_chunks)

        # Convert to WAV format
        buffer = io.BytesIO()
        sf.write(buffer, full_audio, 24000, format='WAV')
        buffer.seek(0)

        return Response(
            content=buffer.read(),
            media_type="audio/wav",
            headers={
                "Content-Disposition": "inline; filename=speech.wav"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS error: {str(e)}")


@app.post("/api/stt")
async def speech_to_text(audio: UploadFile = File(...)):
    """Convert speech to text using Groq Whisper"""
    try:
        # Read the audio file
        audio_data = await audio.read()

        # Create a file-like object for Groq
        audio_file = io.BytesIO(audio_data)
        audio_file.name = audio.filename or "audio.webm"

        # Transcribe using Groq Whisper
        transcription = groq_client.audio.transcriptions.create(
            file=audio_file,
            model="whisper-large-v3-turbo",
            response_format="json",
            language="en"
        )

        return {
            "text": transcription.text,
            "success": True
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"STT error: {str(e)}")


@app.get("/api/voices")
async def list_voices():
    """List available TTS voices"""
    # Kokoro voices - you can expand this list based on the available voices
    voices = [
        {"id": "af_heart", "name": "Heart (Female)", "language": "en-US"},
        {"id": "af_bella", "name": "Bella (Female)", "language": "en-US"},
        {"id": "af_sarah", "name": "Sarah (Female)", "language": "en-US"},
        {"id": "am_adam", "name": "Adam (Male)", "language": "en-US"},
        {"id": "am_michael", "name": "Michael (Male)", "language": "en-US"},
    ]
    return {"voices": voices}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
