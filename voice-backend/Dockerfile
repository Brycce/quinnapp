FROM python:3.12-slim

WORKDIR /app

# Install system dependencies (ffmpeg + wget for audio conversion and downloads)
RUN apt-get update && apt-get install -y ffmpeg wget && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download Kokoro model files
RUN wget -q https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files/kokoro-v0_19.onnx
RUN wget -q https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin -O voices.bin

# Copy application
COPY main.py .

# Expose port
EXPOSE 8000

# Run the application
CMD ["python", "main.py"]
