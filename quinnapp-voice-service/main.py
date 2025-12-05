"""Quinn Voice Service - FastAPI WebSocket Server"""

import os
import asyncio
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import logging

from agent import VoiceAgent

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(title="Quinn Voice Service")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to your domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {
        "service": "Quinn Voice Agent",
        "status": "running",
        "version": "1.0.0"
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.websocket("/ws/voice")
async def voice_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for voice conversations.

    Protocol:
    - Client sends: {"type": "audio", "data": base64_audio_chunk}
    - Server sends: {"type": "audio", "data": base64_audio_chunk}
    - Server sends: {"type": "transcript", "text": "user said this"}
    - Server sends: {"type": "response", "text": "agent response"}
    - Client sends: {"type": "end"}
    - Server sends: {"type": "complete", "request_id": "uuid"}
    """
    await websocket.accept()
    logger.info("WebSocket connection established")

    try:
        # Create a new voice agent for this session
        agent = VoiceAgent(websocket)

        # Start the agent
        await agent.start()

        # Main message loop
        while True:
            # Receive message from client
            message = await websocket.receive_text()
            data = json.loads(message)

            # Handle different message types
            if data.get("type") == "audio":
                # Process audio chunk from client
                await agent.process_audio(data.get("data"))

            elif data.get("type") == "end":
                # End conversation and save to database
                request_id = await agent.end_conversation()
                await websocket.send_json({
                    "type": "complete",
                    "request_id": request_id
                })
                break

            elif data.get("type") == "cancel":
                # Cancel conversation without saving
                logger.info("Conversation cancelled by client")
                break

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception as e:
        logger.error(f"Error in voice websocket: {e}")
        try:
            await websocket.send_json({
                "type": "error",
                "message": str(e)
            })
        except:
            pass
    finally:
        # Cleanup
        try:
            await websocket.close()
        except:
            pass


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 8000))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info"
    )
