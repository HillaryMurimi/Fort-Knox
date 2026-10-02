'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { landlordOnboardingClient as client, type LandlordProgress } from '@/lib/data/landlord-onboarding';
export function useLandlordProgress(org?: string) {
  return useQuery({ queryKey: ['landlord-onboarding', org], queryFn: () => client.status(org!), enabled: !!org, refetchInterval: query => query.state.data?.state === 'PAYMENT_PENDING' ? 5000 : false });
}
export function useLandlordCommand(org: string) {
  const cache = useQueryClient();
  return useMutation({ mutationFn: (run: () => Promise<LandlordProgress>) => run(), onSuccess: data => { cache.setQueryData(['landlord-onboarding', org], data); void cache.invalidateQueries({ queryKey: ['billing'] }); } });
}
