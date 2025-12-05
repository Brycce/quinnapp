# Quinn Voice Service

Python voice agent backend using Pipecat framework for real-time voice conversations.

## Features

- **Real-time voice conversations** via WebSocket
- **Speech-to-Text**: Groq Whisper-large-v3-turbo
- **LLM**: Groq llama-3.3-70b-versatile
- **Text-to-Speech**: Cartesia Sonic (50ms latency)
- **Database**: Supabase (saves service requests)

## Setup

### 1. Install Dependencies

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install requirements
pip install -r requirements.txt
```

### 2. Environment Variables

Copy `.env.example` to `.env` and fill in your API keys:

```bash
cp .env.example .env
```

Required keys:
- `GROQ_API_KEY` - Get from https://console.groq.com
- `CARTESIA_API_KEY` - Get from https://cartesia.ai
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key

### 3. Run Locally

```bash
python main.py
```

Server runs on `http://localhost:8000`

WebSocket endpoint: `ws://localhost:8000/ws/voice`

## API

### WebSocket Protocol

**Connect**: `ws://localhost:8000/ws/voice`

**Client → Server Messages:**

```json
{
  "type": "audio",
  "data": "base64_encoded_pcm_audio"
}
```

```json
{
  "type": "end"
}
```

**Server → Client Messages:**

```json
{
  "type": "transcript",
  "text": "what the user said"
}
```

```json
{
  "type": "response",
  "text": "agent response text"
}
```

```json
{
  "type": "audio",
  "data": "base64_encoded_pcm_audio"
}
```

```json
{
  "type": "complete",
  "request_id": "uuid"
}
```

### Audio Format

- **Encoding**: PCM 16-bit signed integer
- **Sample Rate**: 16kHz
- **Channels**: Mono (1 channel)

## Deployment

### Render.com

1. Create new Web Service
2. Connect your Git repository
3. Set build command: `pip install -r requirements.txt`
4. Set start command: `python main.py`
5. Add environment variables
6. Deploy!

### Railway.app

1. Create new project
2. Deploy from GitHub repo
3. Add environment variables
4. Railway auto-detects Python and runs the app

## Cost Estimates

Per conversation (~3 minutes):
- Groq STT: ~$0.0001 (virtually free)
- Groq LLM: ~$0.001
- Cartesia TTS: ~$0.01
- **Total: ~$0.01 per conversation**

## Development

### Testing

Test WebSocket connection:

```bash
# Install wscat
npm install -g wscat

# Connect
wscat -c ws://localhost:8000/ws/voice
```

### Logs

Logs are output to console. In production, configure proper logging with log aggregation service.

## Architecture

```
Browser Mic
    ↓
WebSocket
    ↓
FastAPI Server (main.py)
    ↓
VoiceAgent (agent.py)
    ├→ Groq Whisper (STT)
    ├→ Groq LLM (conversational AI)
    ├→ Cartesia (TTS)
    └→ Supabase (save requests)
    ↓
WebSocket
    ↓
Browser Audio Playback
```

## TODO

- [ ] Extract structured data from conversations (service type, location, contact info)
- [ ] Add conversation history persistence
- [ ] Implement proper error handling and retries
- [ ] Add authentication/authorization
- [ ] Add rate limiting
- [ ] Add conversation analytics
