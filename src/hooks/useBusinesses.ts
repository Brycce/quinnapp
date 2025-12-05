import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchBusinesses, updateBusiness, type DiscoveredBusiness } from '../lib/api';

export function useBusinesses(requestId: string | undefined) {
  return useQuery<DiscoveredBusiness[]>({
    queryKey: ['businesses', requestId],
    queryFn: () => fetchBusinesses(requestId!),
    enabled: !!requestId,
    refetchInterval: 10000, // Refetch every 10 seconds for contact extraction updates
  });
}

export function useUpdateBusiness(requestId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ businessId, updates }: {
      businessId: string;
      updates: { outreach_status?: string; outreach_notes?: string }
    }) => updateBusiness(requestId, businessId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['businesses', requestId] });
    },
  });
}
