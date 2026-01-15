import { useState, useRef } from 'react';
import { Send } from 'lucide-react';

const exampleProjects = [
  'Fix a leaky faucet',
  'Install new light fixtures',
  'Repair HVAC system',
  'Replace roof shingles',
];

export function Landing() {
  const [step, setStep] = useState<'describe' | 'phone' | 'success'>('describe');
  const [projectDescription, setProjectDescription] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const quinnPhoneNumber = '+1 (480) 569-1254';
  const quinnPhoneLink = 'tel:+14805691254';

  const handleDescriptionSubmit = () => {
    if (projectDescription.trim()) {
      setStep('phone');
    }
  };

  const handlePhoneSubmit = async () => {
    if (phoneNumber.trim()) {
      setIsSubmitting(true);
      // TODO: Integrate with backend to send SMS
      await new Promise(resolve => setTimeout(resolve, 1000));
      setIsSubmitting(false);
      setStep('success');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-50 via-white to-purple-50 relative overflow-hidden">
      {/* Decorative Elements */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full blur-3xl opacity-30 -mr-48 -mt-48"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-purple-100 to-blue-100 rounded-full blur-3xl opacity-30 -ml-48 -mb-48"></div>

      {/* Header */}
      <header className="py-4 md:py-6 px-4 relative z-10">
        <div className="max-w-6xl mx-auto">
          <div className="text-lg md:text-xl font-semibold">Quinn</div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-4 relative z-10 py-8 md:py-0">
        <div className="max-w-5xl w-full text-center">
          <h1 className="mb-3 md:mb-4 leading-tight px-4">
            <span className="block text-5xl md:text-7xl font-bold mb-2">Stop chasing contractors.</span>
            <span className="block text-3xl md:text-5xl font-normal text-gray-500">Let AI do it for you.</span>
          </h1>
          <p className="text-gray-600 mb-8 md:mb-10 text-base md:text-lg max-w-2xl mx-auto px-4">
            Quinn contacts top-rated pros in your area and gets you estimates—so you don't have to.
          </p>

          {/* Trust Signal */}
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mb-12 md:mb-16">
            <div className="flex -space-x-2">
              <img src="https://images.unsplash.com/photo-1635221798248-8a3452ad07cd?w=100&h=100&fit=crop" alt="" className="w-8 h-8 rounded-full border-2 border-white object-cover" />
              <img src="https://images.unsplash.com/photo-1655069705106-d22e4d45ce53?w=100&h=100&fit=crop" alt="" className="w-8 h-8 rounded-full border-2 border-white object-cover" />
              <img src="https://images.unsplash.com/photo-1616697412153-7ad8ac8aa5d9?w=100&h=100&fit=crop" alt="" className="w-8 h-8 rounded-full border-2 border-white object-cover" />
              <img src="https://images.unsplash.com/photo-1728881667082-06be928f08d0?w=100&h=100&fit=crop" alt="" className="w-8 h-8 rounded-full border-2 border-white object-cover" />
            </div>
            <span className="text-xs md:text-sm">Trusted by thousands of homeowners</span>
          </div>

          {/* Step 1: Project Description */}
          {step === 'describe' && (
            <div className="max-w-2xl mx-auto mb-16 md:mb-20">
              <div className="flex gap-2 md:gap-3 items-center mb-4">
                <input
                  ref={inputRef}
                  type="text"
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleDescriptionSubmit()}
                  placeholder="Describe your project..."
                  className="flex-1 px-5 md:px-6 py-4 md:py-5 rounded-full border border-gray-200 focus:outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100 transition-all bg-white/80 backdrop-blur-sm text-base md:text-lg shadow-lg"
                />
                <button
                  onClick={handleDescriptionSubmit}
                  disabled={!projectDescription.trim()}
                  className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white flex items-center justify-center hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0 shadow-lg hover:shadow-xl"
                >
                  <Send className="w-5 h-5 md:w-6 md:h-6" />
                </button>
              </div>

              <div className="overflow-x-auto -mx-4 px-4">
                <div className="flex gap-2 w-max mx-auto">
                  {exampleProjects.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => {
                        setProjectDescription(suggestion);
                        setTimeout(() => setStep('phone'), 100);
                      }}
                      className="px-4 py-2 rounded-full border border-gray-200 hover:border-blue-200 hover:bg-blue-50 transition-all text-sm text-gray-600 whitespace-nowrap bg-white/60 backdrop-blur-sm"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Phone Number */}
          {step === 'phone' && (
            <div className="max-w-2xl mx-auto mb-16 md:mb-20">
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-100 p-6 mb-6">
                <p className="text-gray-500 text-sm mb-2">Your project:</p>
                <p className="text-gray-900 font-medium mb-4">{projectDescription}</p>
                <button
                  type="button"
                  onClick={() => setStep('describe')}
                  className="text-blue-600 text-sm hover:underline"
                >
                  Edit
                </button>
              </div>

              <div className="flex gap-2 md:gap-3 items-center mb-4">
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handlePhoneSubmit()}
                  placeholder="Enter your phone number..."
                  className="flex-1 px-5 md:px-6 py-4 md:py-5 rounded-full border border-gray-200 focus:outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100 transition-all bg-white/80 backdrop-blur-sm text-base md:text-lg shadow-lg"
                />
                <button
                  onClick={handlePhoneSubmit}
                  disabled={!phoneNumber.trim() || isSubmitting}
                  className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white flex items-center justify-center hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0 shadow-lg hover:shadow-xl"
                >
                  {isSubmitting ? (
                    <svg className="animate-spin w-5 h-5 md:w-6 md:h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <Send className="w-5 h-5 md:w-6 md:h-6" />
                  )}
                </button>
              </div>

              <p className="text-gray-500 text-sm">
                We'll text you within minutes to get started.
              </p>
            </div>
          )}

          {/* Step 3: Success */}
          {step === 'success' && (
            <div className="max-w-2xl mx-auto mb-16 md:mb-20">
              <div className="bg-green-50 rounded-2xl border border-green-200 p-8 mb-6 shadow-lg">
                <div className="text-5xl mb-4">✓</div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">You're all set!</h2>
                <p className="text-gray-600 mb-6">
                  Quinn will text you shortly at <span className="font-medium">{phoneNumber}</span> to help find contractors for your project.
                </p>
                <div className="border-t border-green-200 pt-6">
                  <p className="text-gray-500 text-sm mb-2">
                    Prefer to talk? Call us directly:
                  </p>
                  <a href={quinnPhoneLink} className="text-blue-600 font-semibold text-lg hover:underline">
                    {quinnPhoneNumber}
                  </a>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setStep('describe');
                  setProjectDescription('');
                  setPhoneNumber('');
                }}
                className="text-gray-500 text-sm hover:underline"
              >
                Submit another project
              </button>
            </div>
          )}

          {/* Simple benefits - only show on describe step */}
          {step === 'describe' && (
            <div className="text-center text-sm md:text-base text-gray-500 px-4">
              Free • Multiple quotes • Top-rated pros only • 24-hour response
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
