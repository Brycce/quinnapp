#!/bin/bash
set -e

echo "🚀 Starting Unmute Services on RunPod"
echo "======================================"

# RunPod SSH connection
POD_SSH="anxtzmiknhvqal-64411a82@ssh.runpod.io"
SSH_KEY="$HOME/.ssh/id_ed25519"

echo "📡 Connecting to RunPod..."

# Create the startup script on RunPod
ssh -i "$SSH_KEY" "$POD_SSH" 'bash -s' << 'ENDSSH'
set -e

echo "Setting up environment..."

# Set up paths
export PATH="$HOME/.local/bin:$PATH"
. "$HOME/.cargo/env" 2>/dev/null || true

cd /workspace/unmute

# Start Docker daemon if not running
if ! docker ps &>/dev/null; then
    echo "Starting Docker daemon..."
    dockerd --iptables=false --ip-masq=false --storage-driver=vfs > /dev/null 2>&1 &
    sleep 5
fi

# Kill any existing services
pkill -f "moshi-server" || true
docker-compose down || true

echo "Building and starting STT/TTS services..."

# Start services with docker-compose
docker-compose up -d stt tts

echo ""
echo "✅ Services starting!"
echo ""
echo "Check logs with:"
echo "  docker-compose logs -f stt"
echo "  docker-compose logs -f tts"
echo ""
echo "🌐 Your endpoints:"
echo "  STT: https://anxtzmiknhvqal-60390.proxy.runpod.net"
echo "  TTS: https://anxtzmiknhvqal-60389.proxy.runpod.net"

ENDSSH

echo ""
echo "✅ RunPod services started!"
echo ""
echo "🎯 Next: Start local backend"
echo "   cd backend-unmute && docker-compose -f docker-compose.runpod.yml up -d"
