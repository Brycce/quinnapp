import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Loader2 } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

export function VoiceChat() {
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [conversation, setConversation] = useState<Message[]>([]);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          console.log('Sending audio chunk, size:', event.data.size);
          event.data.arrayBuffer().then(buffer => wsRef.current?.send(buffer));
        }
      };
      // Collect 3 seconds of audio before sending
      mediaRecorder.start(3000);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch (error) {
      console.error('Could not access microphone:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
    setIsRecording(false);
  };

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000/ws/voice');
    ws.onopen = async () => {
      console.log('Connected to voice backend');
      setIsConnected(true);
      // Auto-start recording when connected
      setTimeout(async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const mediaRecorder = new MediaRecorder(stream);
          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && ws?.readyState === WebSocket.OPEN) {
              console.log('Sending audio chunk, size:', event.data.size);
              event.data.arrayBuffer().then(buffer => ws?.send(buffer));
            }
          };
          // Collect 3 seconds of audio before sending
          mediaRecorder.start(3000);
          mediaRecorderRef.current = mediaRecorder;
          setIsRecording(true);
        } catch (error) {
          console.error('Could not access microphone:', error);
        }
      }, 500);
    };
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('Received message:', data.type);

      if (data.type === 'transcription') {
        setConversation(prev => [...prev, {
          role: 'user',
          text: data.text,
          timestamp: new Date()
        }]);
        setIsProcessing(true);
      } else if (data.type === 'response') {
        setConversation(prev => [...prev, {
          role: 'assistant',
          text: data.text,
          timestamp: new Date()
        }]);
        setIsProcessing(false);

        // Use browser TTS
        if (!isMuted && 'speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance(data.text);
          utterance.rate = 1.0;
          utterance.pitch = 1.0;
          // Try to find a female voice
          const voices = window.speechSynthesis.getVoices();
          const femaleVoice = voices.find(v => v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Victoria'));
          if (femaleVoice) utterance.voice = femaleVoice;

          utterance.onstart = () => setIsSpeaking(true);
          utterance.onend = () => setIsSpeaking(false);
          utterance.onerror = () => setIsSpeaking(false);

          window.speechSynthesis.speak(utterance);
        }
      } else if (data.type === 'audio' && !isMuted) {
        playAudio(data.data);
      }
    };
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    ws.onclose = () => {
      console.log('Disconnected from voice backend');
      setIsConnected(false);
    };
    wsRef.current = ws;
    return () => ws.close();
  }, [isMuted]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation]);

  const playAudio = async (base64Audio: string) => {
    try {
      // Stop any currently playing audio
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
      }

      // Convert base64 to blob
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);

      // Create and play audio element
      const audio = new Audio(url);
      setCurrentAudio(audio);
      setIsSpeaking(true);

      audio.onended = () => {
        URL.revokeObjectURL(url);
        setIsSpeaking(false);
        setCurrentAudio(null);
      };

      audio.onerror = (e) => {
        console.error('Audio playback error:', e);
        setIsSpeaking(false);
        setCurrentAudio(null);
      };

      await audio.play();
    } catch (error) {
      console.error('Error playing audio:', error);
      setIsSpeaking(false);
    }
  };

  return (
    <div className="flex flex-col h-full max-h-[600px] bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 rounded-t-lg">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Talk to Quint</h2>
            <div className="flex items-center gap-2 mt-1">
              {isConnected ? (
                <>
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <p className="text-sm">Connected</p>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                  <p className="text-sm">Connecting...</p>
                </>
              )}
            </div>
          </div>
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 hover:bg-blue-700 rounded-full transition-colors"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Conversation Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
        {conversation.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <p className="text-center">
              {isConnected ? 'Press the mic button to start talking' : 'Connecting to Quint...'}
            </p>
          </div>
        ) : (
          <>
            {conversation.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] px-4 py-2 rounded-lg ${
                    msg.role === 'user'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white border border-gray-200 text-gray-800'
                  }`}
                >
                  <p className="text-sm font-medium mb-1">
                    {msg.role === 'user' ? 'You' : 'Quint'}
                  </p>
                  <p>{msg.text}</p>
                </div>
              </div>
            ))}
            {isProcessing && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 px-4 py-2 rounded-lg">
                  <div className="flex items-center gap-2 text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <p className="text-sm">Quint is thinking...</p>
                  </div>
                </div>
              </div>
            )}
            <div ref={conversationEndRef} />
          </>
        )}
      </div>

      {/* Status Bar */}
      <div className="border-t border-gray-200 p-3 bg-gray-50 rounded-b-lg">
        <div className="flex items-center justify-center gap-3">
          {isRecording && (
            <div className="flex items-center gap-2 text-red-600">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium">Listening...</span>
            </div>
          )}
          {isProcessing && !isSpeaking && (
            <div className="flex items-center gap-2 text-blue-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Processing...</span>
            </div>
          )}
          {isSpeaking && (
            <div className="flex items-center gap-2 text-green-600">
              <Volume2 className="w-4 h-4" />
              <span className="text-sm">Quint is responding...</span>
            </div>
          )}
          {!isRecording && !isProcessing && !isSpeaking && isConnected && (
            <span className="text-sm text-gray-500">Ready</span>
          )}
        </div>
      </div>
    </div>
  );
}
