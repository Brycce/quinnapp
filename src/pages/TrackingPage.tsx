import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchTrackingInfo } from '../lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';

function getStatusMessage(status: string, discoveryStatus: string, count: number): string {
  if (discoveryStatus === 'pending') {
    return 'We\'re getting started on finding contractors for you.';
  }
  if (discoveryStatus === 'in_progress') {
    return 'We\'re actively searching for the best contractors in your area.';
  }
  if (discoveryStatus === 'completed' && count > 0) {
    return `Great news! We found ${count} contractors. We'll be reaching out to them on your behalf.`;
  }
  if (discoveryStatus === 'failed') {
    return 'We encountered an issue finding contractors. Our team is looking into it.';
  }
  return 'Your request is being processed.';
}

export function TrackingPage() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['tracking', token],
    queryFn: () => fetchTrackingInfo(token!),
    enabled: !!token,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center text-gray-500">
            Loading your request...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <h2 className="text-xl font-semibold text-gray-900">Request Not Found</h2>
            <p className="mt-2 text-gray-500">
              We couldn't find a request with this tracking link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Your Service Request</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Service type */}
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600">
              {data.service_type || 'Home Service'}
            </div>
          </div>

          {/* Status message */}
          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <p className="text-blue-800">
              {getStatusMessage(data.status, data.discovery_status, data.contractors_found)}
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 bg-gray-100 rounded-lg">
              <div className="text-2xl font-bold">{data.contractors_found}</div>
              <div className="text-sm text-gray-500">Contractors Found</div>
            </div>
            <div className="text-center p-4 bg-gray-100 rounded-lg">
              <div className="text-2xl font-bold capitalize">{data.discovery_status}</div>
              <div className="text-sm text-gray-500">Status</div>
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-sm text-gray-500">
            We'll keep you updated as we connect with contractors.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
