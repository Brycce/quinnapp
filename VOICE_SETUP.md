# Voice Conversation Setup Guide

Your app now has voice conversation capabilities using:
- **Kokoro TTS** for natural text-to-speech
- **Groq Whisper Large V3 Turbo** for fast, accurate speech-to-text

## 🚀 Quick Start

### 1. Install Backend Dependencies

```bash
cd backend

# Install Python packages
pip install -r requirements.txt

# Install espeak-ng (required for Kokoro TTS)
# macOS:
brew install espeak-ng

# Linux/Ubuntu:
sudo apt-get install espeak-ng

# Windows:
# Download and install from: https://github.com/espeak-ng/espeak-ng/releases
```

### 2. Get Groq API Key

1. Go to https://console.groq.com/
2. Sign up for a free account
3. Create an API key

### 3. Configure Environment

```bash
cd backend
cp .env.example .env

# Edit .env and add your Groq API key:
# GROQ_API_KEY=your_actual_api_key_here
```

### 4. Start the Backend

```bash
cd backend
python main.py
```

The backend will start on http://localhost:8000

### 5. Use Voice in Your App

Your frontend is already running on http://localhost:3000. You'll see a microphone button next to the text input:

1. Click the **microphone icon** to switch to voice mode
2. Click the **large microphone button** to start recording
3. Speak your message
4. Click again to stop recording
5. Your voice will be transcribed and sent automatically

## 🎤 Features

### Current Features
- ✅ Voice input (speech-to-text)
- ✅ Voice output (text-to-speech)
- ✅ Multiple voice options
- ✅ Real-time transcription
- ✅ Seamless text/voice switching

### Voice Options

Available voices in Kokoro TTS:
- `af_heart` - Heart (Female) - Default
- `af_bella` - Bella (Female)
- `af_sarah` - Sarah (Female)
- `am_adam` - Adam (Male)
- `am_michael` - Michael (Male)

To change the voice, modify the `voice` parameter in the TTS request.

## 🔧 API Endpoints

### Backend (http://localhost:8000)

- `GET /` - Health check
- `POST /api/tts` - Convert text to speech
  ```json
  {
    "text": "Hello, how can I help you?",
    "voice": "af_heart"
  }
  ```
- `POST /api/stt` - Convert speech to text (multipart/form-data with audio file)
- `GET /api/voices` - List available voices

## 🐛 Troubleshooting

### "Failed to access microphone"
- Check browser permissions (allow microphone access)
- Use HTTPS or localhost (required for microphone access)

### "TTS service not available"
- Make sure espeak-ng is installed
- Check backend logs for Kokoro initialization errors

### "STT error"
- Verify your Groq API key is correct in `.env`
- Check your Groq account has available credits

### Backend connection errors
- Make sure the backend is running on port 8000
- Check CORS settings if accessing from different domain

## 💡 Next Steps

1. **Integrate with AI**: Add your AI model to generate intelligent responses
2. **Conversation History**: Store and replay voice conversations
3. **Voice Selection UI**: Let users choose their preferred voice
4. **Background Processing**: Improve performance with audio streaming
5. **Mobile Support**: Test and optimize for mobile browsers

## 📚 Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: FastAPI (Python)
- **TTS**: Kokoro (open-source, 82M parameters)
- **STT**: Groq Whisper Large V3 Turbo
- **Audio**: Web Audio API, MediaRecorder API

## 🎯 Performance

- **Groq Whisper**: ~1-2 seconds transcription time
- **Kokoro TTS**: Fast generation, small model size
- **Total roundtrip**: ~2-4 seconds for full conversation turn
