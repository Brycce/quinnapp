# Moshi Voice Backend

Full-duplex real-time voice conversation using Moshi from Kyutai Labs.

## Features

- 🎯 **Full-duplex conversation** - Listen and speak simultaneously
- ⚡ **~200ms latency** - Near real-time response
- 🎙️ **Streaming audio** - 80ms streaming latency
- 🧠 **Built-in AI** - Conversational intelligence included
- 💾 **Ultra low bandwidth** - 1.1 kbps

## Quick Setup

### 1. Install Moshi

```bash
pip install -U moshi
```

### 2. Start the Server

```bash
python -m moshi.server
```

The server will start on **http://localhost:8998**

### 3. Access the Web UI

Open your browser and go to:
```
http://localhost:8998
```

You'll see Moshi's built-in voice interface ready to use!

## Integration Options

### Option 1: Standalone (Recommended)
Just open http://localhost:8998 in a new browser tab. This gives you the full Moshi experience with built-in echo cancellation.

### Option 2: Embedded iFrame
You can embed Moshi in your app using an iframe:

```tsx
<iframe
  src="http://localhost:8998"
  style={{ width: '100%', height: '600px', border: 'none' }}
  allow="microphone"
/>
```

### Option 3: Custom Client (Advanced)
For deep integration, you can build a custom WebSocket client that connects to port 8998 using Moshi's protocol.

## Voice Options

Two voice models available:
- **Moshika** (female voice) - default
- **Moshiko** (male voice)

To use Moshiko:
```bash
python -m moshi.server --hf-repo kyutai/moshiko-pytorch-bf16
```

## Remote Access

If you want to access Moshi from a different machine:

```bash
# Using Gradio tunnel (adds ~500ms latency)
python -m moshi.server --gradio-tunnel

# Or use SSH port forwarding
ssh -L 8998:localhost:8998 your-server
```

## System Requirements

- Python 3.10+
- ~8GB RAM
- GPU recommended (works on CPU but slower)
- Microphone access in browser

## Troubleshooting

### "Failed to load model"
Make sure you have enough RAM/VRAM. The model is ~7B parameters.

### Microphone not working
- Check browser permissions
- Use http://localhost:8998 (not HTTPS for PyTorch version)
- Make sure no other app is using the microphone

### High latency
- Use PyTorch version for local deployment (not --gradio-tunnel)
- Ensure GPU is being used if available
- Close other heavy applications

## Performance Tips

1. **Use the web UI** - It includes echo cancellation for better quality
2. **GPU acceleration** - Much faster than CPU-only
3. **Local deployment** - Don't use tunnel mode unless needed
4. **Good microphone** - Better input = better responses

## Next Steps

1. Try the basic web UI at http://localhost:8998
2. Test the full-duplex capability (interrupt Moshi while it's speaking!)
3. Integrate into your app using iframe or custom client
4. Experiment with both voice models (Moshika/Moshiko)

## Tech Stack

- **Model**: 7B parameter speech-text foundation model
- **Codec**: Mimi (24 kHz audio → 1.1 kbps)
- **Latency**: ~200ms end-to-end, 80ms streaming
- **Framework**: PyTorch
