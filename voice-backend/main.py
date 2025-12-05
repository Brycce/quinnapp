import os
import asyncio
import base64
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
import replicate
from kokoro_onnx import Kokoro
import io
import soundfile as sf

# Import routers
from routers import vapi_webhook, service_requests, businesses, tracking

# Import job processor
from services.job_processor import process_pending_jobs


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start background job processor
    job_task = asyncio.create_task(process_pending_jobs())
    print("Background job processor started")
    yield
    # Cleanup
    job_task.cancel()
    try:
        await job_task
    except asyncio.CancelledError:
        pass


app = FastAPI(lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(vapi_webhook.router)
app.include_router(service_requests.router)
app.include_router(businesses.router)
app.include_router(tracking.router)

# API clients
groq = OpenAI(
    api_key=os.getenv("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1"
)

# Initialize Kokoro TTS
kokoro = Kokoro("kokoro-v0_19.onnx", "voices.bin")

# Conversation history
conversations = {}

SYSTEM_PROMPT = """You are Quint, a friendly home service assistant. Your job is to help users find the right home service professionals.

Ask relevant questions to understand their needs:
- What type of service do they need? (plumber, electrician, cleaner, etc.)
- When do they need it?
- What's the specific problem or task?
- Any other important details?

Be conversational, brief, and helpful. Keep responses short (1-2 sentences)."""

INITIAL_GREETING = "Hi, I'm Quint. I'll reach out to top rated local contractors for home services and share the estimates with you. What do you need help with?"


async def transcribe_audio(audio_data: bytes) -> str:
    """Convert audio to text using Groq Whisper"""
    try:
        # Save audio temporarily - just use WebM directly
        temp_file = "/tmp/audio.webm"

        with open(temp_file, "wb") as f:
            f.write(audio_data)

        # Transcribe with Groq Whisper (it handles WebM)
        with open(temp_file, "rb") as f:
            transcription = groq.audio.transcriptions.create(
                model="whisper-large-v3",
                file=f,
                response_format="text"
            )

        return transcription.strip()
    except Exception as e:
        print(f"Transcription error: {e}")
        return ""


async def get_llm_response(user_id: str, user_message: str) -> str:
    """Get LLM response from Groq"""
    try:
        # Initialize conversation if needed
        if user_id not in conversations:
            conversations[user_id] = [
                {"role": "system", "content": SYSTEM_PROMPT}
            ]

        # Add user message
        conversations[user_id].append({"role": "user", "content": user_message})

        # Get response
        response = groq.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=conversations[user_id],
            max_tokens=150,
            temperature=0.7
        )

        assistant_message = response.choices[0].message.content

        # Add to conversation
        conversations[user_id].append({"role": "assistant", "content": assistant_message})

        return assistant_message
    except Exception as e:
        print(f"LLM error: {e}")
        return "I'm sorry, I'm having trouble processing that. Could you try again?"


async def text_to_speech(text: str) -> bytes:
    """Convert text to speech using local Kokoro"""
    try:
        print(f"Generating TTS for: {text[:50]}...")

        # Generate audio with Kokoro (American Female voice)
        audio, sample_rate = kokoro.create(text, voice='af', speed=1.0, lang='en-us')

        # Convert to WAV bytes
        buffer = io.BytesIO()
        sf.write(buffer, audio, sample_rate, format='WAV')
        audio_bytes = buffer.getvalue()

        print(f"TTS generated: {len(audio_bytes)} bytes")
        return audio_bytes
    except Exception as e:
        print(f"TTS error: {e}")
        import traceback
        traceback.print_exc()
        return b""


@app.websocket("/ws/voice")
async def voice_chat(websocket: WebSocket):
    await websocket.accept()
    user_id = str(id(websocket))

    try:
        # Send initial greeting
        print("Sending initial greeting text...")
        await websocket.send_json({
            "type": "response",
            "text": INITIAL_GREETING
        })

        # Generate TTS for initial greeting
        print("Generating TTS for greeting...")
        greeting_audio = await text_to_speech(INITIAL_GREETING)
        print(f"TTS generated, audio length: {len(greeting_audio)} bytes")
        if greeting_audio:
            print("Sending greeting audio to client...")
            await websocket.send_json({
                "type": "audio",
                "data": base64.b64encode(greeting_audio).decode()
            })
            print("Greeting audio sent!")
        else:
            print("WARNING: No greeting audio generated!")

        while True:
            # Receive audio from client
            data = await websocket.receive_bytes()

            # 1. Speech to Text
            user_text = await transcribe_audio(data)
            if not user_text:
                continue

            print(f"User said: {user_text}")

            # Send transcription to client
            await websocket.send_json({
                "type": "transcription",
                "text": user_text
            })

            # 2. Get LLM response
            response_text = await get_llm_response(user_id, user_text)
            print(f"Assistant: {response_text}")

            # Send LLM response text to client
            await websocket.send_json({
                "type": "response",
                "text": response_text
            })

            # 3. Text to Speech
            audio_data = await text_to_speech(response_text)

            # Send audio to client
            if audio_data:
                await websocket.send_json({
                    "type": "audio",
                    "data": base64.b64encode(audio_data).decode()
                })

    except WebSocketDisconnect:
        print(f"Client {user_id} disconnected")
        if user_id in conversations:
            del conversations[user_id]
    except Exception as e:
        print(f"Error: {e}")
        await websocket.close()


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
