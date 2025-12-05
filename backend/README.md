# Voice Backend

Python backend service for voice conversation using:
- **Kokoro TTS** for text-to-speech
- **Groq Whisper Large V3 Turbo** for speech-to-text

## Setup

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

2. Install espeak-ng (required for Kokoro):
   - **macOS**: `brew install espeak-ng`
   - **Linux/Ubuntu**: `sudo apt-get install espeak-ng`
   - **Windows**: Download and install from [GitHub releases](https://github.com/espeak-ng/espeak-ng/releases)

3. Create `.env` file with your Groq API key:
```bash
cp .env.example .env
# Edit .env and add your GROQ_API_KEY
```

4. Get a free Groq API key from: https://console.groq.com/

## Running

```bash
python main.py
```

The server will start on http://localhost:8000

## API Endpoints

- `GET /` - Health check
- `POST /api/tts` - Text to speech (body: `{"text": "...", "voice": "af_heart"}`)
- `POST /api/stt` - Speech to text (multipart/form-data with audio file)
- `GET /api/voices` - List available voices
