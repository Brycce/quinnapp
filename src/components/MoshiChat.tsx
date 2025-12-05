import { useState } from 'react';
import { ExternalLink, Minimize2, Maximize2 } from 'lucide-react';

interface MoshiChatProps {
  onClose?: () => void;
}

export function MoshiChat({ onClose }: MoshiChatProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const MOSHI_URL = 'http://localhost:8998';

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50' : 'relative'} bg-white rounded-lg shadow-xl overflow-hidden`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          <h3 className="font-semibold">Moshi Voice Assistant</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.open(MOSHI_URL, '_blank')}
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

      {/* Moshi iframe */}
      <iframe
        src={MOSHI_URL}
        className="w-full border-none"
        style={{ height: isFullscreen ? 'calc(100vh - 52px)' : '500px' }}
        allow="microphone"
        title="Moshi Voice Chat"
      />

      {/* Instructions */}
      <div className="bg-gray-50 px-4 py-3 text-sm text-gray-600 border-t">
        <p className="mb-1">
          <strong>Full-duplex voice conversation</strong> - You can interrupt naturally!
        </p>
        <p className="text-xs text-gray-500">
          Click the microphone in the frame above to start. Powered by Moshi (~200ms latency)
        </p>
      </div>
    </div>
  );
}
