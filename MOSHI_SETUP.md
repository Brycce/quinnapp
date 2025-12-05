# 🎙️ Moshi Voice Setup - Full-Duplex AI Conversation

Your app now uses **Moshi** from Kyutai Labs - a cutting-edge full-duplex voice AI with ~200ms latency!

## 🌟 Why Moshi?

- **Full-duplex** - Interrupt naturally while AI is speaking (like real conversation!)
- **Ultra-low latency** - ~200ms response time
- **Streaming audio** - 80ms streaming latency
- **All-in-one** - No separate TTS/STT services needed
- **Built-in AI** - Conversational intelligence included
- **Low bandwidth** - Only 1.1 kbps

## 🚀 Quick Start (2 minutes)

### 1. Install Moshi

```bash
pip install -U moshi
```

### 2. Start the Server

```bash
python -m moshi.server
```

That's it! The server runs on **http://localhost:8998**

### 3. Try Voice in Your App

1. Your web app is already running at http://localhost:3000
2. Click the **microphone icon** next to the input box
3. Moshi's interface will appear in an embedded frame
4. Click the mic button and start talking!

## 🎯 Features You'll Love

### Natural Interruptions
Unlike traditional voice assistants, you can interrupt Moshi mid-sentence. It will stop talking and listen to you - just like a real person!

### Two Voice Options

**Moshika (Female - Default)**
```bash
python -m moshi.server
```

**Moshiko (Male)**
```bash
python -m moshi.server --hf-repo kyutai/moshiko-pytorch-bf16
```

### Fullscreen Mode
Click the expand icon in the Moshi frame to go fullscreen for an immersive experience.

### Open in New Window
Click the external link icon to open Moshi in a separate tab.

## 🔧 System Requirements

- **Python**: 3.10 or higher
- **RAM**: ~8GB minimum
- **GPU**: Recommended (works on CPU but slower)
- **Browser**: Modern browser with microphone support

## 💡 Integration Modes

The app currently uses **iframe embedding** (easiest and recommended). Moshi includes built-in echo cancellation in the web UI for best quality.

## 🐛 Troubleshooting

### "Connection Failed" or Blank Frame
```bash
# Make sure Moshi is running
python -m moshi.server

# Verify it's accessible
open http://localhost:8998
```

### Model Download Takes Forever
First run downloads ~7GB model. Subsequent runs are instant.

### Microphone Permission Denied
- Click the microphone icon in the Moshi frame (not browser bar)
- Grant permission when prompted
- Refresh if needed

### High Latency / Slow Response
- **Use GPU**: Ensure CUDA/Metal is available
- **Close heavy apps**: Free up RAM
- **Check CPU usage**: Moshi needs compute power
- **First message slower**: Model warmup, then fast

### Audio Quality Issues
- **Use headphones**: Prevents feedback loops
- **Quiet environment**: Less background noise
- **Good microphone**: Better input = better output
- **Stay close to mic**: Within 1-2 feet

## 🎓 Usage Tips

1. **Speak naturally** - Moshi understands conversational speech
2. **Feel free to interrupt** - Full-duplex means real-time conversation
3. **Use headphones** - Prevents echo and improves quality
4. **Test latency** - Ask quick questions to feel the ~200ms response
5. **Try both voices** - Moshika (female) and Moshiko (male)

## 🔐 Privacy Note

Moshi runs **100% locally** on your machine. No data is sent to external servers. Your conversations stay private.

## 📊 Performance Benchmarks

- **Latency**: ~200ms end-to-end
- **Streaming**: 80ms audio streaming
- **Bandwidth**: 1.1 kbps (extremely low)
- **Model size**: ~7B parameters
- **Sample rate**: 24 kHz

## 🚀 Advanced: Custom Integration

Want to build a custom client instead of using the iframe?

1. Connect to `ws://localhost:8998` (WebSocket)
2. Follow Moshi's protocol (see their web client source)
3. Implement custom UI with your design

Check `backend-moshi/README.md` for more details.

## 📱 Mobile Support

The iframe approach works on mobile browsers too! Make sure to:
- Grant microphone permissions
- Use headphones to prevent echo
- Ensure stable network connection

## 🎨 Customization

The MoshiChat component supports:
- Custom styling via props
- Fullscreen toggle
- Open in new window
- Close button (when embedded)

Edit `src/components/MoshiChat.tsx` to customize.

## 🆚 vs. Traditional Voice Assistants

| Feature | Moshi | Traditional |
|---------|-------|-------------|
| Latency | ~200ms | 2-5 seconds |
| Duplex | Full | Half |
| Interruptions | Natural | Awkward |
| Setup | 1 command | Multiple services |
| Cost | Free/Local | API costs |
| Privacy | 100% local | Cloud-based |

## 🎯 Next Steps

1. **Try it now**: Click the mic and start talking!
2. **Test interruptions**: Start talking while Moshi is speaking
3. **Compare voices**: Try both Moshika and Moshiko
4. **Integrate with your flow**: Connect Moshi responses to your app logic
5. **Share feedback**: Moshi is open-source - contribute improvements!

## 📚 Resources

- [Moshi GitHub](https://github.com/kyutai-labs/moshi)
- [Kyutai Labs](https://kyutai.org/)
- [Research Paper](https://kyutai.org/Moshi.pdf)

---

**Ready to experience the future of voice AI?** Just run `python -m moshi.server` and click the mic! 🎤
