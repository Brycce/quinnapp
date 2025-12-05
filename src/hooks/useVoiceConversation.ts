import { useState, useCallback } from 'react';

interface UseVoiceConversationProps {
  onMessage?: (text: string, sender: 'user' | 'bot') => void;
}

export function useVoiceConversation({ onMessage }: UseVoiceConversationProps = {}) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const handleTranscript = useCallback((text: string) => {
    console.log('User said:', text);
    onMessage?.(text, 'user');
    setIsListening(false);
  }, [onMessage]);

  const handleResponse = useCallback((text: string) => {
    console.log('Bot responds:', text);
    onMessage?.(text, 'bot');
    setIsSpeaking(true);
  }, [onMessage]);

  const handleSpeakingComplete = useCallback(() => {
    setIsSpeaking(false);
  }, []);

  return {
    isListening,
    isSpeaking,
    handleTranscript,
    handleResponse,
    handleSpeakingComplete,
  };
}
