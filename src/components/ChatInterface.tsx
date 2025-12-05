import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Mic } from 'lucide-react';
import { ServiceCarousel } from './ServiceCarousel';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { VoiceChat } from './VoiceChat';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
}

interface Question {
  text: string;
  suggestions?: string[];
}

const questions: Question[] = [
  {
    text: "What type of service do you need?",
    suggestions: ['Plumbing', 'Electrical', 'HVAC', 'Roofing', 'Landscaping', 'Painting']
  },
  {
    text: "Can you describe what needs to be done?"
  },
  {
    text: "When do you need this done?",
    suggestions: ['ASAP', 'This week', 'This month', 'Flexible']
  },
  {
    text: "Want to share photos or videos? They help providers give more accurate estimates."
  },
  {
    text: "What's your zip code?"
  },
  {
    text: "What's your name?"
  },
  {
    text: "What's your email address?"
  },
  {
    text: "What's your phone number?"
  }
];

const initialSuggestions = [
  'Fix a leaky faucet',
  'Install new light fixtures',
  'Repair HVAC system',
  'Replace roof shingles',
  'Landscape backyard',
  'Paint interior walls'
];

export function ChatInterface() {
  const [hasStarted, setHasStarted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [isDone, setIsDone] = useState(false);
  const [showSignUp, setShowSignUp] = useState(false);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [password, setPassword] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [showVoiceMode, setShowVoiceMode] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (questionIndex === 3) {
      setShowFileUpload(true);
    } else {
      setShowFileUpload(false);
    }
  }, [questionIndex]);

  const startChat = (initialMessage: string) => {
    setHasStarted(true);
    setMessages([
      { id: '0', text: questions[0].text, sender: 'bot' },
      { id: '1', text: initialMessage, sender: 'user' }
    ]);
    setQuestionIndex(1);
    setInput('');
    
    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: questions[1].text,
        sender: 'bot'
      }]);
    }, 600);
  };

  const nextQuestion = () => {
    const next = questionIndex + 1;
    if (next < questions.length) {
      setQuestionIndex(next);
      setTimeout(() => {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          text: questions[next].text,
          sender: 'bot'
        }]);
      }, 600);
    } else {
      // All questions answered, now show sign-up
      setShowSignUp(true);
      setTimeout(() => {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          text: "Great! Now let's create your account so you can track your estimates and communicate with providers.",
          sender: 'bot'
        }]);
      }, 600);
    }
  };

  const handleSignUp = (method: 'password' | 'google' | 'apple') => {
    setShowSignUp(false);
    setIsDone(true);
    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: "Perfect! Your account has been created. Quint is now connecting you with qualified providers in your area. You'll receive estimates within 24 hours.",
        sender: 'bot'
      }]);
    }, 600);
  };

  const handleSend = (text: string) => {
    if (!text.trim()) return;
    
    if (!hasStarted) {
      startChat(text);
      return;
    }

    if (isDone) return;
    
    // Capture email (question index 6)
    if (questionIndex === 6) {
      setUserEmail(text);
      setSignUpEmail(text);
    }
    
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      text,
      sender: 'user'
    }]);
    setInput('');
    nextQuestion();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const names = Array.from(files).map(f => f.name).join(', ');
      handleSend(`📎 ${names}`);
    }
  };

  const currentQuestion = questions[questionIndex];

  // Landing page view
  if (!hasStarted) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-50 via-white to-purple-50 relative overflow-hidden">
        {/* Decorative Elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full blur-3xl opacity-30 -mr-48 -mt-48"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-purple-100 to-blue-100 rounded-full blur-3xl opacity-30 -ml-48 -mb-48"></div>
        
        {/* Header */}
        <header className="py-4 md:py-6 px-4 relative z-10">
          <div className="max-w-6xl mx-auto">
            <div className="text-lg md:text-xl font-semibold">Quint</div>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex items-center justify-center px-4 relative z-10 py-8 md:py-0">
          <div className="max-w-5xl w-full text-center">
            <h1 className="mb-3 md:mb-4 leading-tight px-4">
              <span className="block text-5xl md:text-7xl font-bold mb-2">Stop chasing contractors.</span>
              <span className="block text-3xl md:text-5xl font-normal text-gray-700" style={{ fontFamily: '"Playfair Display", Georgia, serif' }}>Let AI do it for you.</span>
            </h1>
            <p className="text-gray-600 mb-8 md:mb-10 text-base md:text-lg max-w-2xl mx-auto px-4">
              Quint contacts top-rated pros in your area and gets you estimates—so you don't have to.
            </p>

            {/* Trust Signal */}
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mb-12 md:mb-16">
              <div className="flex -space-x-2">
                <ImageWithFallback src="https://images.unsplash.com/photo-1635221798248-8a3452ad07cd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwbHVtYmVyJTIwcHJvZmVzc2lvbmFsfGVufDF8fHx8MTc2MTMzMDQ5Mnww&ixlib=rb-4.1.0&q=80&w=1080" alt="" className="w-8 h-8 rounded-full border-2 border-white object-cover" />
                <ImageWithFallback src="https://images.unsplash.com/photo-1655069705106-d22e4d45ce53?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxlbGVjdHJpY2lhbiUyMHdvcmtlcnxlbnwxfHx8fDE3NjEzMzE2MTF8MA&ixlib=rb-4.1.0&q=80&w=1080" alt="" className="w-8 h-8 rounded-full border-2 border-white object-cover" />
                <ImageWithFallback src="https://images.unsplash.com/photo-1616697412153-7ad8ac8aa5d9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwYWludGVyJTIwY29udHJhY3RvcnxlbnwxfHx8fDE3NjEzMzE2MTF8MA&ixlib=rb-4.1.0&q=80&w=1080" alt="" className="w-8 h-8 rounded-full border-2 border-white object-cover" />
                <ImageWithFallback src="https://images.unsplash.com/photo-1728881667082-06be928f08d0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsYW5kc2NhcGVyJTIwZ2FyZGVuZXJ8ZW58MXx8fHwxNzYxMzQ2MzU1fDA&ixlib=rb-4.1.0&q=80&w=1080" alt="" className="w-8 h-8 rounded-full border-2 border-white object-cover" />
              </div>
              <span className="text-xs md:text-sm">Trusted by thousands of homeowners</span>
            </div>

            {/* Input Section */}
            <div className="max-w-2xl mx-auto mb-16 md:mb-20">

              {!showVoiceMode ? (
                <div className="flex gap-2 md:gap-3 items-center mb-4">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
                    placeholder="Describe your project..."
                    className="flex-1 px-5 md:px-6 py-4 md:py-5 rounded-full border border-gray-200 focus:outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100 transition-all bg-white/80 backdrop-blur-sm text-base md:text-lg shadow-lg"
                  />
                  <button
                    onClick={() => setShowVoiceMode(true)}
                    className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-white border-2 border-purple-200 text-purple-600 flex items-center justify-center hover:bg-purple-50 transition-all flex-shrink-0 shadow-lg hover:shadow-xl"
                  >
                    <Mic className="w-5 h-5 md:w-6 md:h-6" />
                  </button>
                  <button
                    onClick={() => handleSend(input)}
                    disabled={!input.trim()}
                    className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white flex items-center justify-center hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0 shadow-lg hover:shadow-xl"
                  >
                    <Send className="w-5 h-5 md:w-6 md:h-6" />
                  </button>
                </div>
              ) : (
                <div className="mb-4">
                  <VoiceChat />
                  <button
                    onClick={() => setShowVoiceMode(false)}
                    className="mt-4 px-6 py-2 bg-gray-200 rounded-full hover:bg-gray-300 transition"
                  >
                    Close Voice Mode
                  </button>
                </div>
              )}

              <div className="overflow-x-auto -mx-4 px-4">
                <div className="flex gap-2 w-max mx-auto">
                  {initialSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => handleSend(suggestion)}
                      className="px-4 py-2 rounded-full border border-gray-200 hover:border-blue-200 hover:bg-blue-50 transition-all text-sm text-gray-600 whitespace-nowrap bg-white/60 backdrop-blur-sm"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Simple benefits */}
            <div className="text-center text-sm md:text-base text-gray-500 px-4">
              Free • Multiple quotes • Top-rated pros only • 24-hour response
            </div>

            {/* App Store Buttons */}
            <div className="flex items-center justify-center gap-3 mt-8 px-4">
              <a href="#" className="inline-block">
                <img 
                  src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg" 
                  alt="Download on the App Store" 
                  className="h-10 md:h-12"
                />
              </a>
              <a href="#" className="inline-block">
                <img 
                  src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png" 
                  alt="Get it on Google Play" 
                  className="h-[58px] md:h-[70px]"
                />
              </a>
            </div>
          </div>
        </div>


      </div>
    );
  }

  // Chat view
  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden">
      <div className="flex-shrink-0 py-4 px-4 border-b border-gray-200">
        <div className="max-w-3xl mx-auto">
          <h1>Get Home Service Estimates</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-8 overscroll-contain">
        <div className="max-w-3xl mx-auto space-y-6 pb-4">
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-3xl px-5 py-3 ${
                msg.sender === 'user' 
                  ? 'bg-black text-white' 
                  : 'bg-gray-100 text-gray-900'
              }`}>
                {msg.text}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {!isDone && !showSignUp && (
        <div className="flex-shrink-0 border-t border-gray-200 bg-white px-4 py-4">
          <div className="max-w-3xl mx-auto">
            {currentQuestion.suggestions && (
              <div className="flex flex-wrap gap-2 mb-3">
                {currentQuestion.suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => handleSend(suggestion)}
                    className="px-4 py-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors text-sm"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {showFileUpload && (
              <div className="mb-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors text-sm flex items-center gap-2"
                >
                  <Paperclip className="w-4 h-4" />
                  Upload files
                </button>
              </div>
            )}

            {!showVoiceMode ? (
              <div className="flex gap-3 items-center">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
                  placeholder="Type your answer..."
                  className="flex-1 px-5 py-3 rounded-full border border-gray-300 focus:outline-none focus:border-gray-400 transition-colors"
                />
                <button
                  onClick={() => setShowVoiceMode(true)}
                  className="w-11 h-11 rounded-full bg-white border-2 border-purple-200 text-purple-600 flex items-center justify-center hover:bg-purple-50 transition-colors flex-shrink-0"
                >
                  <Mic className="w-5 h-5" />
                </button>
                <button
                  onClick={() => handleSend(input)}
                  disabled={!input.trim()}
                  className="w-11 h-11 rounded-full bg-black text-white flex items-center justify-center hover:bg-gray-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <div>
                <VoiceChat />
                <button
                  onClick={() => setShowVoiceMode(false)}
                  className="mt-4 px-6 py-2 bg-gray-200 rounded-full hover:bg-gray-300 transition w-full"
                >
                  Close Voice Mode
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showSignUp && (
        <div className="flex-shrink-0 border-t border-gray-200 bg-white px-4 py-6">
          <div className="max-w-md mx-auto space-y-4">
            <div className="space-y-3">
              <div className="flex flex-col gap-3">
                <input
                  type="email"
                  value={signUpEmail}
                  onChange={(e) => setSignUpEmail(e.target.value)}
                  placeholder="Email address"
                  className="w-full px-5 py-3 rounded-full border border-gray-300 focus:outline-none focus:border-gray-400 transition-colors"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && password.trim() && signUpEmail.trim() && handleSignUp('password')}
                  placeholder="Create a password"
                  className="w-full px-5 py-3 rounded-full border border-gray-300 focus:outline-none focus:border-gray-400 transition-colors"
                />
                <button
                  onClick={() => handleSignUp('password')}
                  disabled={!password.trim() || !signUpEmail.trim()}
                  className="w-full px-6 py-3 rounded-full bg-black text-white hover:bg-gray-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  Create Account
                </button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-white text-gray-500">or continue with</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleSignUp('google')}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-full border border-gray-300 hover:bg-gray-50 transition-colors"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Google
                </button>
                <button
                  onClick={() => handleSignUp('apple')}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-full border border-gray-300 hover:bg-gray-50 transition-colors"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                  </svg>
                  Apple
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isDone && (
        <div className="flex-shrink-0 border-t border-gray-200 bg-white px-4 py-8">
          <div className="max-w-3xl mx-auto text-center text-gray-500">
            Thanks for using our service!
          </div>
        </div>
      )}
    </div>
  );
}
