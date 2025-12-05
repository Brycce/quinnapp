"""Voice Agent with Pipecat Pipeline"""

import os
import base64
import json
import asyncio
from typing import Optional
import logging
from datetime import datetime
import uuid

from fastapi import WebSocket
from groq import Groq
from cartesia import Cartesia
from supabase import create_client, Client

from prompts import VOICE_AGENT_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


class VoiceAgent:
    """Voice agent that processes audio and manages conversation."""

    def __init__(self, websocket: WebSocket):
        self.websocket = websocket
        self.conversation_id = str(uuid.uuid4())

        # Initialize API clients
        self.groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        self.cartesia_client = Cartesia(api_key=os.getenv("CARTESIA_API_KEY"))

        # Initialize Supabase
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        self.supabase: Client = create_client(supabase_url, supabase_key)

        # Conversation state
        self.conversation_history = []
        self.audio_buffer = bytearray()
        self.collected_data = {}
        self.transcript = []

        # Voice model settings
        self.voice_id = "a0e99841-438c-4a64-b679-ae501e7d6091"  # Cartesia default voice

    async def start(self):
        """Initialize the voice agent."""
        logger.info(f"Starting voice agent session: {self.conversation_id}")

        # Add system prompt to conversation
        self.conversation_history.append({
            "role": "system",
            "content": VOICE_AGENT_SYSTEM_PROMPT
        })

        # Send greeting
        greeting = "Hi! I'm Quinn. What can I help you with today?"
        await self.send_response(greeting)

    async def process_audio(self, audio_base64: str):
        """
        Process incoming audio chunk from client.

        Args:
            audio_base64: Base64 encoded audio data (PCM 16-bit, 16kHz mono)
        """
        try:
            # Decode base64 audio
            audio_bytes = base64.b64decode(audio_base64)
            self.audio_buffer.extend(audio_bytes)

            # When buffer reaches certain size (e.g., 1 second of audio), transcribe
            # 16kHz * 2 bytes * 1 second = 32000 bytes
            if len(self.audio_buffer) >= 32000:
                await self.transcribe_audio()

        except Exception as e:
            logger.error(f"Error processing audio: {e}")
            await self.websocket.send_json({
                "type": "error",
                "message": "Failed to process audio"
            })

    async def transcribe_audio(self):
        """Transcribe accumulated audio buffer using Groq Whisper."""
        if len(self.audio_buffer) == 0:
            return

        try:
            # Convert raw PCM to WAV format for Whisper
            import wave
            import io

            wav_buffer = io.BytesIO()
            with wave.open(wav_buffer, 'wb') as wav_file:
                wav_file.setnchannels(1)  # Mono
                wav_file.setsampwidth(2)  # 16-bit
                wav_file.setframerate(16000)  # 16kHz
                wav_file.writeframes(bytes(self.audio_buffer))

            wav_buffer.seek(0)

            # Transcribe with Groq Whisper
            transcription = self.groq_client.audio.transcriptions.create(
                file=("audio.wav", wav_buffer),
                model="whisper-large-v3-turbo",
                language="en"
            )

            user_text = transcription.text.strip()

            if user_text:
                logger.info(f"Transcribed: {user_text}")

                # Send transcript to client
                await self.websocket.send_json({
                    "type": "transcript",
                    "text": user_text
                })

                # Add to conversation history
                self.conversation_history.append({
                    "role": "user",
                    "content": user_text
                })

                self.transcript.append({
                    "role": "user",
                    "text": user_text,
                    "timestamp": datetime.utcnow().isoformat()
                })

                # Get agent response
                await self.generate_response()

            # Clear buffer
            self.audio_buffer.clear()

        except Exception as e:
            logger.error(f"Error transcribing audio: {e}")
            # Don't fail the whole session, just skip this chunk
            self.audio_buffer.clear()

    async def generate_response(self):
        """Generate agent response using Groq LLM."""
        try:
            # Get completion from Groq
            response = self.groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=self.conversation_history,
                temperature=0.7,
                max_tokens=150  # Keep responses short for voice
            )

            agent_text = response.choices[0].message.content.strip()

            logger.info(f"Agent response: {agent_text}")

            # Add to conversation history
            self.conversation_history.append({
                "role": "assistant",
                "content": agent_text
            })

            self.transcript.append({
                "role": "assistant",
                "text": agent_text,
                "timestamp": datetime.utcnow().isoformat()
            })

            # Send response
            await self.send_response(agent_text)

        except Exception as e:
            logger.error(f"Error generating response: {e}")
            await self.websocket.send_json({
                "type": "error",
                "message": "Failed to generate response"
            })

    async def send_response(self, text: str):
        """
        Send text response and synthesize speech.

        Args:
            text: Response text to send and speak
        """
        try:
            # Send text response first
            await self.websocket.send_json({
                "type": "response",
                "text": text
            })

            # Synthesize speech with Cartesia
            audio = self.cartesia_client.tts.sse(
                model_id="sonic-english",
                transcript=text,
                voice_id=self.voice_id,
                output_format={
                    "container": "raw",
                    "encoding": "pcm_s16le",
                    "sample_rate": 16000
                }
            )

            # Stream audio chunks to client
            for chunk in audio:
                if chunk.get("audio"):
                    audio_base64 = base64.b64encode(chunk["audio"]).decode()
                    await self.websocket.send_json({
                        "type": "audio",
                        "data": audio_base64
                    })

        except Exception as e:
            logger.error(f"Error sending response: {e}")
            # At least send the text even if audio fails
            try:
                await self.websocket.send_json({
                    "type": "response",
                    "text": text
                })
            except:
                pass

    async def end_conversation(self) -> str:
        """
        End conversation and save to Supabase.

        Returns:
            request_id: UUID of created service request
        """
        try:
            logger.info("Ending conversation and saving to database")

            # Extract service request data from conversation
            # In a real implementation, you'd use LLM to extract structured data
            # For now, we'll save the full transcript

            # TODO: Use LLM to extract:
            # - service_type
            # - description
            # - location
            # - name, phone, address
            # - urgency

            # Save to service_requests table
            request_data = {
                "conversation_id": self.conversation_id,
                "status": "pending",
                "service_type": "unknown",  # TODO: Extract from conversation
                "data": {
                    "transcript": self.transcript,
                    "source": "voice"
                }
            }

            result = self.supabase.table("service_requests").insert(request_data).execute()

            request_id = result.data[0]["id"]
            logger.info(f"Created service request: {request_id}")

            return request_id

        except Exception as e:
            logger.error(f"Error saving conversation: {e}")
            # Return conversation_id as fallback
            return self.conversation_id
