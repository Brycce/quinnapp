import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

export function Landing() {
  const [step, setStep] = useState<'describe' | 'phone' | 'success'>('describe');
  const [projectDescription, setProjectDescription] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const quinnPhoneNumber = '+1 (480) 569-1254';
  const quinnPhoneLink = 'tel:+14805691254';

  const exampleProjects = [
    'Fix a leaky faucet',
    'Install new light fixtures',
    'Repair HVAC system',
    'Replace roof shingles',
  ];

  const handleDescriptionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (projectDescription.trim()) {
      setStep('phone');
    }
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneNumber.trim()) {
      setIsSubmitting(true);
      // TODO: Integrate with backend to send SMS
      // For now, simulate a brief delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      setIsSubmitting(false);
      setStep('success');
    }
  };

  const handleExampleClick = (example: string) => {
    setProjectDescription(example);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header */}
      <header className="px-6 py-6">
        <div className="max-w-4xl mx-auto">
          <span className="text-xl font-bold text-gray-900">Quinn</span>
        </div>
      </header>

      {/* Hero */}
      <div className="max-w-4xl mx-auto px-6 pt-16 pb-20 text-center">
        <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-4">
          Stop chasing contractors.
        </h1>
        <p className="text-4xl md:text-5xl text-gray-400 mb-6">
          Let AI do it for you.
        </p>

        <p className="text-lg text-gray-600 mb-10 max-w-2xl mx-auto">
          Quinn contacts top-rated pros in your area and gets you estimates—so you
          don't have to.
        </p>

        {/* Trust Badge */}
        <div className="flex items-center justify-center gap-3 mb-12">
          <div className="flex -space-x-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-8 h-8 rounded-full bg-gray-300 border-2 border-white"
              />
            ))}
          </div>
          <span className="text-gray-600 text-sm">Trusted by thousands of homeowners</span>
        </div>

        {/* Step 1: Project Description */}
        {step === 'describe' && (
          <div className="max-w-xl mx-auto">
            <form onSubmit={handleDescriptionSubmit} className="relative mb-4">
              <Input
                type="text"
                placeholder="Describe your project..."
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                className="w-full h-14 pl-6 pr-14 text-lg rounded-full border-gray-200 shadow-sm"
              />
              <Button
                type="submit"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-blue-200 hover:bg-blue-300 text-blue-700"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-5 h-5"
                >
                  <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                </svg>
              </Button>
            </form>

            {/* Example prompts */}
            <div className="flex flex-wrap justify-center gap-2">
              {exampleProjects.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => handleExampleClick(example)}
                  className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Phone Number */}
        {step === 'phone' && (
          <div className="max-w-xl mx-auto">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
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

            <form onSubmit={handlePhoneSubmit} className="relative mb-4">
              <Input
                type="tel"
                placeholder="Enter your phone number..."
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full h-14 pl-6 pr-14 text-lg rounded-full border-gray-200 shadow-sm"
              />
              <Button
                type="submit"
                size="icon"
                disabled={isSubmitting}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isSubmitting ? (
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="w-5 h-5"
                  >
                    <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                  </svg>
                )}
              </Button>
            </form>

            <p className="text-gray-500 text-sm">
              We'll text you within minutes to get started.
            </p>
          </div>
        )}

        {/* Step 3: Success */}
        {step === 'success' && (
          <div className="max-w-xl mx-auto">
            <div className="bg-green-50 rounded-2xl border border-green-200 p-8 mb-6">
              <div className="text-4xl mb-4">✓</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">You're all set!</h2>
              <p className="text-gray-600 mb-4">
                Quinn will text you shortly at <span className="font-medium">{phoneNumber}</span> to help find contractors for your project.
              </p>
              <p className="text-gray-500 text-sm">
                Prefer to talk? Call us directly:
              </p>
              <a href={quinnPhoneLink} className="text-blue-600 font-medium hover:underline">
                {quinnPhoneNumber}
              </a>
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

        {/* Value Props */}
        <div className="mt-16 text-gray-500 text-sm">
          Free • Multiple quotes • Top-rated pros only • 24-hour response
        </div>
      </div>

      {/* Footer */}
      <footer className="py-8 text-center text-gray-400 text-sm">
        © 2025 Quinn. All rights reserved.
      </footer>
    </div>
  );
}
