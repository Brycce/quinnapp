import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';

export function Landing() {
  const phoneNumber = '+1 (480) 569-1254';
  const phoneLink = 'tel:+14805691254';

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <div className="max-w-4xl mx-auto px-6 py-20 text-center">
        <h1 className="text-5xl font-bold text-gray-900 mb-6">
          Find the Right Contractor
          <br />
          <span className="text-blue-600">Without the Hassle</span>
        </h1>

        <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
          Call Quinn and tell us what you need done. We'll find top-rated local contractors
          and connect you with the best options—no searching, no spam calls.
        </p>

        <a href={phoneLink}>
          <Button size="lg" className="text-xl px-8 py-6 h-auto">
            Call {phoneNumber}
          </Button>
        </a>

        <p className="mt-4 text-gray-500">
          Available 24/7 • Free to use
        </p>
      </div>

      {/* How it works */}
      <div className="bg-gray-50 py-20">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>

          <div className="grid md:grid-cols-3 gap-8">
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="text-4xl mb-4">📞</div>
                <h3 className="text-xl font-semibold mb-2">1. Call Us</h3>
                <p className="text-gray-600">
                  Tell Quinn what you need—plumber, electrician, roofer, whatever.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 text-center">
                <div className="text-4xl mb-4">🔍</div>
                <h3 className="text-xl font-semibold mb-2">2. We Search</h3>
                <p className="text-gray-600">
                  We find top-rated contractors in your area and reach out on your behalf.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 text-center">
                <div className="text-4xl mb-4">✅</div>
                <h3 className="text-xl font-semibold mb-2">3. Get Connected</h3>
                <p className="text-gray-600">
                  Contractors contact you directly with quotes. You choose the best fit.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Services */}
      <div className="py-20">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-12">Services We Cover</h2>

          <div className="flex flex-wrap justify-center gap-3">
            {[
              'Plumbing', 'Electrical', 'HVAC', 'Roofing', 'Painting',
              'Landscaping', 'Cleaning', 'Handyman', 'Flooring', 'Pest Control',
              'Garage Doors', 'Windows', 'Fencing', 'Concrete', 'And More...'
            ].map((service) => (
              <span
                key={service}
                className="px-4 py-2 bg-gray-100 rounded-full text-gray-700"
              >
                {service}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="bg-blue-600 py-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-blue-100 mb-8">
            One call. Multiple quotes. Zero hassle.
          </p>
          <a href={phoneLink}>
            <Button size="lg" variant="secondary" className="text-xl px-8 py-6 h-auto">
              Call {phoneNumber}
            </Button>
          </a>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-8 text-center text-gray-500 text-sm">
        © 2024 Quinn. All rights reserved.
      </footer>
    </div>
  );
}
