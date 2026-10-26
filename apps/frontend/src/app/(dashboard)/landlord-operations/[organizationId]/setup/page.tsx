import { AssistedSetupView } from '@/components/landlord-operations/assisted-setup-view';

export default async function AssistedSetupPage({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<{ session?: string }> }) {
  const { organizationId } = await params;
  const { session } = await searchParams;
  return <AssistedSetupView organizationId={organizationId} sessionId={session ?? ''} />;
}
