import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SalesCustomerIdentity } from '@/components/sales/sales-customer-identity';
import { salesIdentityClient } from './sales-identity';
const mocks = vi.hoisted(() => ({ auth: { roles: ['SUPER_ADMIN'], isDevMode: false, user: { _id: 'admin' }, memberships: [] }, api: vi.fn().mockResolvedValue({}) }));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/lib/api', () => ({ api: mocks.api }));
const render = () => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><SalesCustomerIdentity id={'a'.repeat(24)} revision={0} /></QueryClientProvider>);
describe('customer identity governance UI', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.auth.roles = ['SUPER_ADMIN']; mocks.auth.isDevMode = false; });
  it('explains proof requirements, preserved records and the linked canonical target', () => { const html = render(); expect(html).toContain('Matching names never establish identity'); expect(html).toContain('canonical target'); expect(html).toContain('Prepare exact merge preview'); });
  it('does not render governance controls for ordinary accounts or preview', () => { mocks.auth.roles = ['LANDLORD']; expect(render()).toBe(''); mocks.auth.roles = ['SUPER_ADMIN']; mocks.auth.isDevMode = true; expect(render()).toBe(''); expect(mocks.api).not.toHaveBeenCalled(); });
  it('preserves the exact merge hash and safely encodes historical cursors', async () => { const body = { decision: 'APPROVE', payloadHash: 'a'.repeat(64) }; await salesIdentityClient.decideMerge('merge', body); expect(mocks.api).toHaveBeenCalledWith('/sales/success/merges/merge/decisions', { method: 'POST', body: JSON.stringify(body) }); await salesIdentityClient.history('lead', 'ACTIVITIES', 'opaque+/cursor'); expect(mocks.api).toHaveBeenLastCalledWith('/sales/success/customers/lead/history?kind=ACTIVITIES&limit=25&cursor=opaque%2B%2Fcursor'); });
});
