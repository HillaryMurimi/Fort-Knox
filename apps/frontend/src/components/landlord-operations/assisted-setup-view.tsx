'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Alert, Button } from '@/components/ui';
import { PropertySetupWizard } from '@/components/properties/property-setup-wizard';
import { landlordOperationsClient as client } from '@/lib/data/landlord-operations';

export function AssistedSetupView({ organizationId, sessionId }: { organizationId: string; sessionId: string }) {
  const auth = useAuth();
  const router = useRouter();
  const [error, setError] = useState('');
  const [ending, setEnding] = useState(false);
  const enabled = auth.roles.includes('SUPER_ADMIN') && !auth.isDevMode && !!sessionId;
  const detail = useQuery({ queryKey: ['landlord-operations', 'detail', organizationId], queryFn: () => client.detail(organizationId), enabled });
  const session = detail.data?.supportSessions.find(entry => entry._id === sessionId);
  if (!enabled) return <Alert tone="warning">A real SUPER_ADMIN session and an approved support request are required.</Alert>;
  if (detail.isLoading) return <p role="status">Checking support access...</p>;
  if (detail.isError) return <Alert tone="destructive">Could not verify support access. <Button variant="link" onClick={() => void detail.refetch()}>Retry</Button></Alert>;
  if (!session || session.status !== 'ACTIVE' || !session.expiresAt || Date.parse(session.expiresAt) <= detail.dataUpdatedAt) return <Alert tone="warning">This support session is not active. <Link className="underline" href="/landlord-operations">Back to operations</Link></Alert>;
  return <div className="space-y-5"><Alert tone="warning" title="Owner-approved assisted setup"><div className="flex flex-wrap items-center justify-between gap-3"><span>For {detail.data?.organization.name}. Access expires {new Date(session.expiresAt).toLocaleString()}. All writes are attributed to your admin session.</span><Button variant="outline" disabled={ending} onClick={async () => { setEnding(true); setError(''); try { await client.endSupport(sessionId); router.push('/landlord-operations'); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not end access.'); setEnding(false); } }}>End support access</Button></div></Alert>{error && <Alert tone="destructive">{error}</Alert>}<PropertySetupWizard support={{ organizationId, sessionId }} /></div>;
}
