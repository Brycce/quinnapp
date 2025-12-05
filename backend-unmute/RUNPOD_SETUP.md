# RunPod Setup for Unmute

Deploy STT/TTS services on RunPod GPU, keep backend + Groq local.

## Architecture

```
┌─────────────────┐
│   Your Mac      │
│  - Backend      │──────> Groq API (LLM)
│  - Frontend     │
└────────┬────────┘
         │
         │ WebSocket
         │
┌────────▼────────┐
│    RunPod       │
│  - STT Service  │ (GPU)
│  - TTS Service  │ (GPU)
└─────────────────┘
```

## Step-by-Step Setup

### Step 1: Create RunPod Account

1. Go to https://runpod.io/
2. Sign up (they have $10 free credit!)
3. Add payment method (optional, can use free credit first)

### Step 2: Deploy STT Service

1. **In RunPod console**, click "Deploy" → "GPU Pod"
2. **Select GPU**:
   - Recommended: **RTX 4090** or **A4000** (16GB+ VRAM)
   - Budget: **RTX 3090** (24GB VRAM)
3. **Select template**: "PyTorch 2.0" or "Ubuntu 22.04 + CUDA 12.0"
4. **Configuration**:
   - Container Disk: 50 GB
   - Volume: Not needed
   - Expose HTTP Ports: `8000`
5. Click "Deploy"

6. **Once running**, click "Connect" and open "Web Terminal"

7. **In the terminal**, run:
```bash
# Install Unmute STT
git clone https://github.com/kyutai-labs/unmute.git
cd unmute
pip install -r requirements-stt.txt

# Start STT service
python -m unmute.stt --host 0.0.0.0 --port 8000
```

8. **Note the endpoint**: Click "Connect" → "HTTP Service" → Copy the URL
   - Should look like: `https://xxxxxxxx-8000.proxy.runpod.net`

### Step 3: Deploy TTS Service

**Repeat Step 2** but for TTS:
- Deploy another pod (or use the same one with different port)
- If same pod: use port `8001`
- Run: `python -m unmute.tts --host 0.0.0.0 --port 8001`
- Note the TTS endpoint URL

### Step 4: Configure Local Backend

Back on your Mac, edit `backend-unmute/.env`:

```bash
# Add these lines (replace with your RunPod URLs):
STT_URL=https://xxxxxxxx-8000.proxy.runpod.net
TTS_URL=https://xxxxxxxx-8001.proxy.runpod.net
```

### Step 5: Update Docker Compose

We'll run backend locally without STT/TTS containers.
