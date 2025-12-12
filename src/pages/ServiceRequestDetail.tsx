import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useServiceRequest } from '../hooks/useServiceRequests';
import { useBusinesses } from '../hooks/useBusinesses';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Button } from '../components/ui/button';

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
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ServiceRequestDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: request, isLoading: requestLoading } = useServiceRequest(id);
  const { data: businesses, isLoading: bizLoading } = useBusinesses(id);
  const [copied, setCopied] = useState(false);

  const handleCopyEmail = async () => {
    if (request?.outreach_email_template) {
      await navigator.clipboard.writeText(request.outreach_email_template);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (requestLoading) {
    return (
      <div className="container mx-auto p-6 max-w-6xl">
        <div className="text-center py-12 text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="container mx-auto p-6 max-w-6xl">
        <div className="text-center py-12 text-red-500">Request not found</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-6">
      {/* Back button */}
      <Link to="/admin" className="text-blue-600 hover:underline text-sm">
        &larr; Back to all requests
      </Link>

      {/* Request Summary */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl">
                {request.service_type || 'Unknown Service'}
              </CardTitle>
              <CardDescription className="mt-1">
                {request.caller_name || 'Unknown'} · {request.caller_phone_alias || 'No phone'}
              </CardDescription>
            </div>
            <Badge className={getStatusColor(request.business_discovery_status)}>
              {request.business_discovery_status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Location:</span>
              <span className="ml-2">{request.zip_code || 'Not specified'}</span>
            </div>
            <div>
              <span className="text-gray-500">Timeline:</span>
              <span className="ml-2">{request.timeline || 'Not specified'}</span>
            </div>
            <div>
              <span className="text-gray-500">Created:</span>
              <span className="ml-2">{formatDate(request.created_at)}</span>
            </div>
            <div>
              <span className="text-gray-500">Status:</span>
              <span className="ml-2">{request.status}</span>
            </div>
          </div>
          {request.description && (
            <div className="mt-4">
              <span className="text-gray-500 text-sm">Description:</span>
              <p className="mt-1">{request.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Outreach Email Template */}
      {request.outreach_email_template && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Outreach Email</CardTitle>
              <Button
                onClick={handleCopyEmail}
                variant={copied ? "default" : "outline"}
                size="sm"
              >
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-4 rounded-lg font-sans">
              {request.outreach_email_template}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Businesses Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Matched Businesses {businesses && `(${businesses.length})`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {bizLoading && (
            <div className="text-center py-8 text-gray-500">Loading businesses...</div>
          )}

          {businesses && businesses.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              {request.business_discovery_status === 'pending' && 'Discovery pending...'}
              {request.business_discovery_status === 'in_progress' && 'Finding contractors...'}
              {request.business_discovery_status === 'completed' && 'No businesses found.'}
              {request.business_discovery_status === 'failed' && 'Discovery failed.'}
            </div>
          )}

          {businesses && businesses.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Business Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Website</TableHead>
                    <TableHead>Form Status</TableHead>
                    <TableHead>Rating</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {businesses.map((biz) => (
                    <TableRow key={biz.id}>
                      <TableCell className="font-medium">{biz.business_name}</TableCell>
                      <TableCell>
                        {biz.phone ? (
                          <a
                            href={`tel:${biz.phone}`}
                            className="text-blue-600 hover:underline"
                          >
                            {biz.phone}
                          </a>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {biz.email ? (
                          <a
                            href={`mailto:${biz.email}`}
                            className="text-blue-600 hover:underline"
                          >
                            {biz.email}
                          </a>
                        ) : (
                          <span className="text-gray-400">
                            {biz.contact_extraction_status === 'pending' && 'Extracting...'}
                            {biz.contact_extraction_status === 'in_progress' && 'Extracting...'}
                            {biz.contact_extraction_status === 'completed' && '-'}
                            {biz.contact_extraction_status === 'failed' && '-'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {biz.website ? (
                          <a
                            href={biz.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            Visit
                          </a>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {biz.form_submission_status === 'completed' && (
                          <div className="flex items-center gap-2">
                            <Badge className="bg-green-100 text-green-800">Success</Badge>
                            {biz.browserbase_replay_url && (
                              <a
                                href={biz.browserbase_replay_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline text-xs"
                              >
                                Replay
                              </a>
                            )}
                          </div>
                        )}
                        {biz.form_submission_status === 'failed' && (
                          <div className="flex items-center gap-2">
                            <Badge className="bg-red-100 text-red-800">Failed</Badge>
                            {biz.browserbase_replay_url && (
                              <a
                                href={biz.browserbase_replay_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline text-xs"
                              >
                                Replay
                              </a>
                            )}
                          </div>
                        )}
                        {biz.form_submission_status === 'in_progress' && (
                          <Badge className="bg-blue-100 text-blue-800">Running...</Badge>
                        )}
                        {biz.form_submission_status === 'pending' && (
                          <span className="text-gray-400 text-sm">
                            {biz.email ? 'Has email' : 'Pending'}
                          </span>
                        )}
                        {!biz.form_submission_status && (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {biz.rating ? (
                          <span>
                            {biz.rating.toFixed(1)}
                            {biz.review_count && (
                              <span className="text-gray-400 text-xs ml-1">
                                ({biz.review_count})
                              </span>
                            )}
                          </span>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
