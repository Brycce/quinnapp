# 🎙️ Unmute Setup - AI Voice Assistant for Home Services

Your app now uses **Unmute** from Kyutai Labs - bringing voice capabilities to GPT-4/Claude with your custom business logic!

## 🌟 What is Unmute?

Unmute wraps any text LLM (GPT-4, Claude, Llama, etc.) with optimized speech-to-text and text-to-speech models, creating a natural voice conversation experience.

**Key Benefits:**
- 🤖 **Use any LLM** - GPT-4, Claude, Llama, Gemini, etc.
- 🎯 **Custom prompts** - Tailored for home service estimates
- 🎙️ **Natural voices** - Low-latency STT and TTS
- 🔧 **Full control** - Customize personality and behavior
- 🏠 **Perfect for your app** - Guides users through estimate questions

## 🚀 Quick Start

### Prerequisites

**Required:**
- Docker & Docker Compose
- NVIDIA GPU with 16GB+ VRAM (for STT/TTS)
- NVIDIA Container Toolkit (for GPU in Docker)
- LLM API key (OpenAI, Anthropic, or run Ollama locally)

**Check GPU:**
```bash
nvidia-smi
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi
```

### 1. Configure Your LLM

```bash
cd backend-unmute
cp .env.example .env
```

Edit `.env` and choose one option:

**Option A: OpenAI GPT-4 (Recommended)**
```bash
LLM_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o
LLM_API_KEY=sk-your-openai-api-key
```
Get API key: https://platform.openai.com/api-keys

**Option B: Anthropic Claude**
```bash
LLM_URL=https://api.anthropic.com/v1
LLM_MODEL=claude-3-5-sonnet-20241022
LLM_API_KEY=sk-ant-your-anthropic-key
```
Get API key: https://console.anthropic.com/

**Option C: Local Ollama (Free!)**
```bash
# First, install Ollama: https://ollama.ai/
ollama pull llama3.1:70b

# Then in .env:
LLM_URL=http://host.docker.internal:11434/v1
LLM_MODEL=llama3.1:70b
LLM_API_KEY=not-needed
```

### 2. Start Unmute

```bash
cd backend-unmute
docker-compose up -d
```

**First run downloads models (~10GB), takes 5-10 minutes. Subsequent starts are instant.**

### 3. Use in Your App

1. Your React app is running at http://localhost:3000
2. Click the **microphone icon**
3. Quinn (your AI voice assistant) will appear
4. Click mic and start talking!

**Quinn will guide users through:**
1. Type of service needed
2. Description of work
3. Timeline preferences
4. Photo/video sharing
5. Contact information
6. And confirm estimate request

## 🎯 Custom Configuration

### Quinn's Personality

Edit `backend-unmute/voices.yaml` to customize Quinn's:
- Conversation style
- Questions to ask
- Tone and personality
- Response patterns

Changes require restart:
```bash
cd backend-unmute
docker-compose restart backend
```

### Using Different Voices

Two voices available in `voices.yaml`:
- **Quinn (Female)** - Default, warm and professional
- **Quinn (Male)** - Same personality, male voice

Add more characters by copying the template in voices.yaml

### Advanced: Custom System Prompts

Edit `backend-unmute/system_prompt.py` for dynamic prompts based on:
- Time of day
- Day of week
- User history
- Special offers

## 🔧 System Requirements

### Minimum
- **GPU**: NVIDIA with 16GB VRAM (RTX 3090, A4000, or better)
- **RAM**: 32GB system RAM
- **Storage**: 20GB for models
- **OS**: Linux (or WSL2 on Windows)

### Recommended
- **GPU**: NVIDIA with 24GB+ VRAM (RTX 4090, A5000)
- **RAM**: 64GB system RAM
- Multi-GPU for better performance

### Notes on macOS
- macOS is not officially supported by Unmute
- Consider using a cloud GPU instance instead

## 🐛 Troubleshooting

### "NVIDIA driver not found"
```bash
# Install NVIDIA Container Toolkit
# Ubuntu/Debian:
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker
```

### "Connection refused" or Blank Frame
```bash
# Check if services are running
docker-compose ps

# View logs
docker-compose logs -f

# Restart services
docker-compose restart
```

### High Latency / Slow Responses
- **Check GPU usage**: `nvidia-smi` should show models loaded
- **Reduce model size**: Use smaller LLM (gpt-3.5-turbo, llama3.1:8b)
- **Multi-GPU**: Distribute STT, TTS, LLM across GPUs

### Out of Memory
```bash
# Use smaller models
# In .env, change to:
LLM_MODEL=gpt-3.5-turbo  # or llama3.1:8b for Ollama
```

### LLM API Errors
- **Check API key**: Make sure it's valid and has credits
- **Check rate limits**: Your API plan may have limits
- **Test LLM directly**: `curl` your LLM endpoint to verify it works

## 📊 Ports & Services

- **3000** - Your React app (already running)
- **3001** - Unmute frontend UI
- **8765** - Unmute backend WebSocket
- **8000** - STT service (internal)
- **8000** - TTS service (internal)

## 💰 Cost Estimates

### Using GPT-4o (OpenAI)
- **Input**: ~$2.50 per 1M tokens
- **Output**: ~$10 per 1M tokens
- **Typical conversation**: ~1,000 tokens = $0.01-0.02
- **100 estimates/day**: ~$1-2/day

### Using Claude (Anthropic)
- Similar pricing to GPT-4

### Using Ollama (Local)
- **FREE!**
- Runs on your GPU
- No API costs
- Privacy: 100% local

## 🎓 Usage Tips

1. **Test with simple questions first** - Make sure everything works
2. **Monitor GPU memory** - Watch `nvidia-smi` to catch issues early
3. **Start with GPT-3.5** - Faster and cheaper for testing
4. **Customize Quinn** - Edit voices.yaml to match your brand
5. **Use headphones** - Prevents echo during testing

## 🔒 Privacy & Security

- **STT/TTS**: Run locally on your GPU (private)
- **LLM**: Depends on your choice
  - **OpenAI/Anthropic**: Sent to their APIs
  - **Ollama**: 100% local, completely private
- **User data**: Never stored by Unmute, only passed to LLM

## 🚀 Next Steps

1. **Test Quinn now**: Click mic and have a conversation
2. **Customize personality**: Edit voices.yaml
3. **Integrate responses**: Capture data from conversations
4. **Add error handling**: Handle edge cases
5. **Monitor usage**: Track API costs and performance

## 📚 Advanced Topics

### Multi-GPU Setup
Distribute services across GPUs in docker-compose.yml:
```yaml
stt:
  environment:
    - CUDA_VISIBLE_DEVICES=0
tts:
  environment:
    - CUDA_VISIBLE_DEVICES=1
```

### Custom WebSocket Integration
Instead of iframe, build custom client:
- Connect to `ws://localhost:8765`
- Follow OpenAI Realtime API protocol
- See `browser_backend_communication.md` in Unmute repo

### Production Deployment
- Use Docker Swarm or Kubernetes
- Load balance multiple instances
- Monitor with Prometheus/Grafana
- Add authentication layer

## 🆚 Why Unmute Over Moshi?

**Unmute wins when you need:**
- ✅ Specific LLM (GPT-4, Claude, etc.)
- ✅ Custom business logic
- ✅ Control over prompts and behavior
- ✅ Integration with existing AI workflows

**Moshi wins when you want:**
- ⚡ Lowest possible latency (~200ms)
- 🔄 Full-duplex (natural interruptions)
- 🎯 Simplest setup (one command)
- 💻 Works on any machine (no GPU required)

**For your home service estimates app, Unmute is better** because you need the control and customization for your specific workflow.

## 📞 Support

- **Unmute Docs**: https://github.com/kyutai-labs/unmute
- **Issues**: https://github.com/kyutai-labs/unmute/issues
- **Docker Docs**: https://docs.docker.com/
- **NVIDIA Container Toolkit**: https://docs.nvidia.com/datacenter/cloud-native/

---

**Ready to try it?**

```bash
cd backend-unmute
docker-compose up -d
```

Then click the mic icon in your app! 🎤
