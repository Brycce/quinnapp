import { useQuery } from '@tanstack/react-query';
import { fetchServiceRequests, fetchServiceRequest, type ServiceRequest } from '../lib/api';

export function useServiceRequests() {
  return useQuery<ServiceRequest[]>({
    queryKey: ['service-requests'],
    queryFn: fetchServiceRequests,
    refetchInterval: 10000, // Refetch every 10 seconds
  });
}

export function useServiceRequest(id: string | undefined) {
  return useQuery<ServiceRequest>({
    queryKey: ['service-request', id],
    queryFn: () => fetchServiceRequest(id!),
    enabled: !!id,
  });
}
