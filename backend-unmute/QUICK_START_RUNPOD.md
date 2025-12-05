# RunPod Quick Start Guide

Get your voice assistant running with RunPod in 15 minutes!

## 🎯 Quick Overview

1. Deploy GPU pod on RunPod (5 min)
2. Install STT/TTS services on RunPod (5 min)
3. Start local backend + frontend (2 min)
4. Test! (3 min)

## 📋 Prerequisites

- RunPod account (sign up at https://runpod.io/)
- Docker installed locally (you have this ✅)
- Groq API key (you have this ✅)

## 🚀 Step 1: Deploy RunPod GPU Pod

### 1.1 Create Pod

1. Go to https://runpod.io/console/pods
2. Click **"+ Deploy"**
3. Choose GPU:
   - **Best value**: RTX 4090 (~$0.44/hr)
   - **Budget**: RTX 3090 (~$0.34/hr)
   - **Premium**: A5000 (~$0.79/hr)
4. Select template: **"RunPod PyTorch 2.1"**
5. Configuration:
   - Container Disk: **50 GB**
   - Expose HTTP Ports: **8000,8001**
   - Click **"Deploy On-Demand"**

### 1.2 Wait for Pod to Start

Pod status will change: Pending → Starting → Running (~1 minute)

## 🛠️ Step 2: Install Services on RunPod

### 2.1 Open Web Terminal

1. Click **"Connect"** on your pod
2. Click **"Start Web Terminal"**
3. Terminal will open in browser

### 2.2 Run Installation

Copy this entire block and paste into RunPod terminal:

```bash
cd /workspace
git clone https://github.com/kyutai-labs/unmute.git
cd unmute
pip install -r requirements.txt
```

Wait ~3 minutes for installation.

### 2.3 Start Both Services

Run this in the terminal:

```bash
# Start STT in background
nohup python -m unmute.stt --host 0.0.0.0 --port 8000 > stt.log 2>&1 &

# Start TTS in background
nohup python -m unmute.tts --host 0.0.0.0 --port 8001 > tts.log 2>&1 &

echo "✅ Services started!"
echo "View logs:"
echo "  tail -f stt.log"
echo "  tail -f tts.log"
```

### 2.4 Get Your Endpoint URLs

1. In RunPod pod page, click **"Connect"**
2. Find **"HTTP Service [Port 8000]"** → Copy URL
   - Example: `https://abc123-8000.proxy.runpod.net`
3. Find **"HTTP Service [Port 8001]"** → Copy URL
   - Example: `https://abc123-8001.proxy.runpod.net`

**Save both URLs!** You'll need them next.

## 💻 Step 3: Configure Local Backend

### 3.1 Update .env File

On your Mac, edit `backend-unmute/.env`:

```bash
# Groq (already configured ✅)
LLM_URL=https://api.groq.com/openai/v1
LLM_MODEL=llama-3.1-8b-instant
LLM_API_KEY=your_groq_api_key_here

# RunPod STT/TTS endpoints (ADD THESE - use your URLs from 2.4)
STT_URL=https://abc123-8000.proxy.runpod.net
TTS_URL=https://abc123-8001.proxy.runpod.net
```

### 3.2 Start Local Services

```bash
cd backend-unmute
docker-compose -f docker-compose.runpod.yml up -d
```

First run downloads images (~2 min). Subsequent starts are instant!

## 🎤 Step 4: Test It!

1. Open your app: http://localhost:3000
2. Click the **microphone icon**
3. Click the **mic button** in the Unmute frame
4. **Say something**: "I need a plumber"
5. Quinn should respond!

## ✅ Success Checklist

- [ ] RunPod pod is running
- [ ] STT service is running (port 8000)
- [ ] TTS service is running (port 8001)
- [ ] Local backend is running
- [ ] Frontend is accessible at localhost:3001
- [ ] Can talk to Quinn and get responses

## 🐛 Troubleshooting

### "Connection refused" in app

**Check backend logs:**
```bash
cd backend-unmute
docker-compose -f docker-compose.runpod.yml logs -f backend
```

Look for errors connecting to STT/TTS URLs.

### RunPod services not responding

**Check RunPod logs:**
In RunPod terminal:
```bash
cd /workspace/unmute
tail -f stt.log
tail -f tts.log
```

**Restart services:**
```bash
pkill -f "unmute.stt"
pkill -f "unmute.tts"

nohup python -m unmute.stt --host 0.0.0.0 --port 8000 > stt.log 2>&1 &
nohup python -m unmute.tts --host 0.0.0.0 --port 8001 > tts.log 2>&1 &
```

### Wrong endpoint URLs

Make sure:
- URLs use `https://` not `http://`
- URLs end with `.proxy.runpod.net`
- Port numbers match (8000 for STT, 8001 for TTS)

### Slow responses

This is normal for first request (model loading). Subsequent requests should be ~2-3 seconds.

## 💰 Cost Management

### Stop When Not Using

**Stop RunPod pod** (saves money!):
```
RunPod Console → Your Pod → Stop
```

**Restart when needed**:
```
RunPod Console → Your Pod → Start
```

Services auto-restart when pod starts!

### Cost Estimate

- **RTX 4090**: $0.44/hour
- **8 hours/day**: ~$3.52/day
- **Only while testing**: Stop when not using!

## 🎓 Pro Tips

1. **Keep pod running during development** - Restart is slower
2. **Stop overnight** - Save money when sleeping
3. **Use cheaper GPU for testing** - RTX 3090 works fine
4. **Monitor logs** - Catch issues early
5. **Set spending limit** - In RunPod settings

## 📊 Monitor Performance

### Check RunPod GPU Usage

In RunPod terminal:
```bash
nvidia-smi
watch nvidia-smi  # Updates every 2 seconds
```

### Check Service Health

```bash
# Test STT
curl https://your-stt-url.proxy.runpod.net/health

# Test TTS
curl https://your-tts-url.proxy.runpod.net/health
```

## 🔄 Restart Everything

If things get stuck:

**On RunPod:**
```bash
pkill -f unmute
nohup python -m unmute.stt --host 0.0.0.0 --port 8000 > stt.log 2>&1 &
nohup python -m unmute.tts --host 0.0.0.0 --port 8001 > tts.log 2>&1 &
```

**Locally:**
```bash
cd backend-unmute
docker-compose -f docker-compose.runpod.yml restart
```

## 🎯 Next Steps

Once working:
1. Customize Quinn's personality (edit voices.yaml)
2. Test different Groq models (llama-3.3-70b-versatile for better quality)
3. Optimize costs (stop pod when not using)
4. Consider RunPod Serverless for production (pay per second)

---

**Need help?** Check logs and error messages first. Most issues are URL mismatches or services not running.
