const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://quinn-oimo.vercel.app';

export interface ServiceRequest {
  id: string;
  caller_phone_alias: string | null;
  caller_name: string | null;
  caller_address: string | null;
  zip_code: string | null;
  service_type: string | null;
  description: string | null;
  timeline: string | null;
  status: string;
  tracking_token: string | null;
  business_discovery_status: string;
  outreach_email_template: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiscoveredBusiness {
  id: string;
  service_request_id: string;
  business_name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  full_address: string | null;
  rating: number | null;
  review_count: number | null;
  contact_extraction_status: string;
  outreach_status: string;
  outreach_notes: string | null;
  form_submission_status: string | null;
  browserbase_session_id: string | null;
  browserbase_replay_url: string | null;
  created_at: string;
}

export interface TrackingInfo {
  service_type: string | null;
  status: string;
  discovery_status: string;
  contractors_found: number;
  created_at: string;
}

export async function fetchServiceRequests(): Promise<ServiceRequest[]> {
  const response = await fetch(`${API_BASE_URL}/api/service-requests`);
  if (!response.ok) {
    throw new Error('Failed to fetch service requests');
  }
  return response.json();
}

export async function fetchServiceRequest(id: string): Promise<ServiceRequest> {
  const response = await fetch(`${API_BASE_URL}/api/service-requests/${id}`);
  if (!response.ok) {
    throw new Error('Failed to fetch service request');
  }
  return response.json();
}

export async function fetchBusinesses(requestId: string): Promise<DiscoveredBusiness[]> {
  const response = await fetch(`${API_BASE_URL}/api/service-requests/${requestId}/businesses`);
  if (!response.ok) {
    throw new Error('Failed to fetch businesses');
  }
  return response.json();
}

export async function updateBusiness(
  requestId: string,
  businessId: string,
  updates: { outreach_status?: string; outreach_notes?: string }
): Promise<DiscoveredBusiness> {
  const response = await fetch(
    `${API_BASE_URL}/api/service-requests/${requestId}/businesses/${businessId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }
  );
  if (!response.ok) {
    throw new Error('Failed to update business');
  }
  return response.json();
}

export async function fetchTrackingInfo(token: string): Promise<TrackingInfo> {
  const response = await fetch(`${API_BASE_URL}/api/track/${token}`);
  if (!response.ok) {
    throw new Error('Request not found');
  }
  return response.json();
}
