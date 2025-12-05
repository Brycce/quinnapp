import { Link } from 'react-router-dom';
import { useServiceRequests } from '../hooks/useServiceRequests';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';

function getStatusColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-green-100 text-green-800';
    case 'in_progress':
      return 'bg-blue-100 text-blue-800';
    case 'failed':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function Dashboard() {
  const { data: requests, isLoading, error } = useServiceRequests();

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Service Requests</h1>
        <p className="text-gray-600 mt-1">Review incoming requests and contractor matches</p>
      </div>

      {isLoading && (
        <div className="text-center py-12 text-gray-500">Loading requests...</div>
      )}

      {error && (
        <div className="text-center py-12 text-red-500">
          Failed to load requests. Is the backend running?
        </div>
      )}

      {requests && requests.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            No service requests yet. They will appear here when homeowners call in.
          </CardContent>
        </Card>
      )}

      {requests && requests.length > 0 && (
        <div className="space-y-4">
          {requests.map((request) => (
            <Link key={request.id} to={`/admin/requests/${request.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold">
                          {request.service_type || 'Unknown Service'}
                        </h3>
                        <Badge className={getStatusColor(request.business_discovery_status)}>
                          {request.business_discovery_status}
                        </Badge>
                      </div>
                      <div className="mt-1 text-sm text-gray-600">
                        <span>{request.caller_name || 'Unknown'}</span>
                        <span className="mx-2">·</span>
                        <span>{request.caller_phone_alias || 'No phone'}</span>
                        <span className="mx-2">·</span>
                        <span>{request.zip_code || 'No location'}</span>
                      </div>
                      {request.description && (
                        <p className="mt-2 text-sm text-gray-500 line-clamp-1">
                          {request.description}
                        </p>
                      )}
                    </div>
                    <div className="text-right text-sm text-gray-500">
                      {formatDate(request.created_at)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
