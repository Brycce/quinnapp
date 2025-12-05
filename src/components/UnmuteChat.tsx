import { useState } from 'react';
import { ExternalLink, Minimize2, Maximize2 } from 'lucide-react';

interface UnmuteChatProps {
  onClose?: () => void;
}

export function UnmuteChat({ onClose }: UnmuteChatProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const UNMUTE_URL = 'http://localhost:3001';

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50' : 'relative'} bg-white rounded-lg shadow-xl overflow-hidden`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          <h3 className="font-semibold">Quinn - Voice Assistant</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.open(UNMUTE_URL, '_blank')}
            className="p-1.5 hover:bg-white/20 rounded transition-colors"
            title="Open in new window"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 hover:bg-white/20 rounded transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/20 rounded transition-colors"
              title="Close"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Unmute iframe */}
      <iframe
        src={UNMUTE_URL}
        className="w-full border-none"
        style={{ height: isFullscreen ? 'calc(100vh - 52px)' : '600px' }}
        allow="microphone"
        title="Quinn Voice Chat"
      />

      {/* Instructions */}
      <div className="bg-gray-50 px-4 py-3 text-sm text-gray-600 border-t">
        <p className="mb-1">
          <strong>Talk to Quinn</strong> - Your AI assistant powered by GPT-4 with natural voice
        </p>
        <p className="text-xs text-gray-500">
          Click the microphone in the frame above to start. Quinn will guide you through getting your estimate.
        </p>
      </div>
    </div>
  );
}
