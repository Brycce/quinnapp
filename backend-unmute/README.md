# Unmute Voice Backend with Groq

Voice-enabled AI assistant using Unmute + Groq for ultra-fast responses.

## Why Groq?

- ⚡ **Blazing fast** - ~1 second response time (vs 3-5s for others)
- 🆓 **Free tier** - Generous quota for development
- 🎯 **Perfect for voice** - Low latency = natural conversation
- 🧠 **Smart** - Llama 3.1 8B is surprisingly capable

## Quick Setup (3 steps)

### 1. Get Groq API Key (FREE)

1. Go to https://console.groq.com/
2. Sign up (it's free!)
3. Create an API key
4. Copy it

### 2. Configure

```bash
cd backend-unmute
cp .env.example .env
```

Edit `.env` and paste your Groq API key:
```bash
LLM_URL=https://api.groq.com/openai/v1
LLM_MODEL=llama-3.1-8b-instant
LLM_API_KEY=gsk_your_actual_groq_api_key_here
```

### 3. Start Unmute

```bash
docker-compose up -d
```

**First run**: Downloads models (~10GB), takes 5-10 min
**After that**: Starts instantly!

## Using in Your App

1. Your React app: http://localhost:3000
2. Click the **microphone icon**
3. Start talking to Quinn!

Quinn will guide users through getting home service estimates with natural voice conversation.

## Groq Model Options

All available in your Groq free tier:

| Model | Speed | Quality | Best For |
|-------|-------|---------|----------|
| `llama-3.1-8b-instant` | ⚡⚡⚡ | ⭐⭐⭐ | Voice chat (RECOMMENDED) |
| `llama-3.3-70b-versatile` | ⚡⚡ | ⭐⭐⭐⭐⭐ | Complex reasoning |
| `mixtral-8x7b-32768` | ⚡⚡ | ⭐⭐⭐⭐ | Long conversations |
| `gemma2-9b-it` | ⚡⚡⚡ | ⭐⭐⭐ | Alternative option |

To change model, edit `LLM_MODEL` in `.env` and restart:
```bash
docker-compose restart backend
```

## System Requirements

- **GPU**: NVIDIA with 16GB+ VRAM (for STT/TTS only, not LLM)
- **RAM**: 32GB
- **Storage**: 20GB for models
- **OS**: Linux or WSL2

**Note**: Groq runs on their infrastructure, so you don't need GPU for the LLM!

## Customizing Quinn

Edit `voices.yaml` to change:
- Questions asked
- Personality and tone
- Voice selection
- Conversation flow

After editing:
```bash
docker-compose restart backend
```

## Troubleshooting

### "Connection refused"
```bash
# Check services are running
docker-compose ps

# View logs
docker-compose logs -f backend
```

### "API key invalid"
- Make sure you copied the full key from Groq Console
- Check for extra spaces in .env file
- Verify key starts with `gsk_`

### "Rate limit exceeded"
- Groq has generous free tier but has limits
- Wait a moment and try again
- Consider upgrading to paid tier if needed

### Slow responses
- Groq should be very fast (~1s)
- If slow, check your internet connection
- Try `llama-3.1-8b-instant` (fastest model)

## Performance

Typical response times with Groq:
- **STT** (speech to text): ~500ms
- **LLM** (Groq Llama 3.1): ~800ms
- **TTS** (text to speech): ~500ms
- **Total roundtrip**: ~2 seconds 🚀

Compare to OpenAI GPT-4:
- **Total roundtrip**: ~5-8 seconds

## Cost

**Groq Free Tier:**
- 30 requests/minute
- 6,000 tokens/minute
- Perfect for development and testing

**Groq Paid (if needed):**
- llama-3.1-8b-instant: $0.05 per 1M tokens (input)
- llama-3.1-8b-instant: $0.08 per 1M tokens (output)
- Typical conversation: ~$0.0001 (essentially free!)

## Next Steps

1. **Test it**: Click mic and talk to Quinn
2. **Customize**: Edit voices.yaml to match your brand
3. **Monitor**: Watch logs to see responses
4. **Iterate**: Adjust prompts based on real conversations

## Resources

- [Groq Console](https://console.groq.com/)
- [Groq Documentation](https://console.groq.com/docs)
- [Unmute GitHub](https://github.com/kyutai-labs/unmute)
- [Full Setup Guide](../UNMUTE_SETUP.md)

---

**Ready to start?**

```bash
# 1. Get Groq API key from console.groq.com
# 2. Edit .env with your key
# 3. Run:
docker-compose up -d
```

Then click the mic! 🎤
