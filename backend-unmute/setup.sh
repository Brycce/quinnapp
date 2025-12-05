#!/bin/bash

# Unmute + Groq Setup Script
# This script helps you get started quickly

set -e

echo "🎙️  Unmute + Groq Setup"
echo "======================="
echo ""

# Check if .env exists
if [ -f .env ]; then
    echo "✓ .env file found"
else
    echo "Creating .env file from template..."
    cp .env.example .env
    echo "✓ .env file created"
    echo ""
    echo "⚠️  IMPORTANT: You need to add your Groq API key!"
    echo ""
    echo "Steps:"
    echo "1. Go to https://console.groq.com/"
    echo "2. Sign up (free!)"
    echo "3. Create an API key"
    echo "4. Edit .env and replace 'gsk_your-groq-api-key-here' with your actual key"
    echo ""
    read -p "Press Enter when you've added your Groq API key to .env..."
fi

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker first:"
    echo "   https://docs.docker.com/get-docker/"
    exit 1
fi
echo "✓ Docker found"

# Check for Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose not found. Please install Docker Compose:"
    echo "   https://docs.docker.com/compose/install/"
    exit 1
fi
echo "✓ Docker Compose found"

# Check for NVIDIA GPU (optional but recommended)
if command -v nvidia-smi &> /dev/null; then
    echo "✓ NVIDIA GPU detected"
    nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
else
    echo "⚠️  No NVIDIA GPU detected"
    echo "   STT/TTS services require GPU. Make sure you have:"
    echo "   - NVIDIA GPU with 16GB+ VRAM"
    echo "   - NVIDIA drivers installed"
    echo "   - NVIDIA Container Toolkit installed"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo ""
echo "🚀 Starting Unmute services..."
echo ""

# Start services
docker-compose up -d

echo ""
echo "📦 Downloading models (first run only, ~10GB)..."
echo "   This may take 5-10 minutes. Subsequent starts are instant."
echo ""

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 5

# Check service status
echo ""
echo "📊 Service Status:"
docker-compose ps

echo ""
echo "✅ Setup complete!"
echo ""
echo "🎯 Next steps:"
echo "1. Open http://localhost:3000 (your React app)"
echo "2. Click the microphone icon"
echo "3. Start talking to Quinn!"
echo ""
echo "💡 Tips:"
echo "- View logs: docker-compose logs -f"
echo "- Stop services: docker-compose down"
echo "- Restart: docker-compose restart"
echo ""
echo "📚 Documentation: ../UNMUTE_SETUP.md"
echo ""
