#!/bin/bash
# Run this script in your RunPod terminal to install Unmute services

echo "🚀 Installing Unmute on RunPod..."
echo ""

# Update system
apt-get update
apt-get install -y git curl

# Clone Unmute
cd /workspace
if [ ! -d "unmute" ]; then
    git clone https://github.com/kyutai-labs/unmute.git
    cd unmute
else
    cd unmute
    git pull
fi

# Install dependencies
pip install -r requirements.txt

echo ""
echo "✅ Installation complete!"
echo ""
echo "🎯 Next steps:"
echo ""
echo "To start STT service:"
echo "  python -m unmute.stt --host 0.0.0.0 --port 8000"
echo ""
echo "To start TTS service:"
echo "  python -m unmute.tts --host 0.0.0.0 --port 8001"
echo ""
echo "Or run both (recommended):"
echo "  python -m unmute.stt --host 0.0.0.0 --port 8000 &"
echo "  python -m unmute.tts --host 0.0.0.0 --port 8001"
echo ""
