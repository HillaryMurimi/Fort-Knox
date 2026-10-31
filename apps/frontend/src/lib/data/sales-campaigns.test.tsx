import { beforeEach, describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SalesCampaigns } from '@/components/sales/sales-campaigns';
import { SalesReferral } from '@/components/sales/sales-referral';
import { campaignClient } from './sales-campaigns';
const mocks = vi.hoisted(() => ({ auth: { roles: ['SUPER_ADMIN'], isDevMode: false, user: { _id: 'admin' } }, api: vi.fn().mockResolvedValue({}) }));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/lib/api', () => ({ api: mocks.api }));
const render = (component: React.ReactNode) => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>{component}</QueryClientProvider>);
describe('campaign governance and invitation UI', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.auth.roles = ['SUPER_ADMIN']; mocks.auth.isDevMode = false; });
  it('shows bounded draft fields and states that approval does not dispatch', () => { const html = render(<SalesCampaigns />); expect(html).toContain('Approval does not send messages'); expect(html).toContain('Daily send ceiling'); expect(html).toContain('Attribution window'); expect(html).toContain('Loading campaigns'); });
  it('denies governance to ordinary and preview accounts without API calls', () => { mocks.auth.roles = ['LANDLORD']; expect(render(<SalesCampaigns />)).toContain('requires SUPER_ADMIN'); mocks.auth.roles = ['SUPER_ADMIN']; mocks.auth.isDevMode = true; expect(render(<SalesCampaigns />)).toContain('requires SUPER_ADMIN'); expect(mocks.api).not.toHaveBeenCalled(); });
  it('passes the exact reviewed hash and revision to the existing API transport', async () => { const body = { action: 'APPROVE', revision: 2, payloadHash: 'b'.repeat(64), reason: 'Reviewed bounded campaign' }; await campaignClient.command('campaign', body); expect(mocks.api).toHaveBeenCalledWith('/sales/success/campaigns/campaign/commands', { method: 'POST', body: JSON.stringify(body) }); });
  it('describes optional analytics while lookup loads without claiming engagement', () => { const html = render(<SalesReferral token={'x'.repeat(43)} />); expect(html).toContain('Optional first-party analytics'); expect(html).toContain('A visit does not tell us whether you read'); expect(html).toContain('Checking your invitation'); expect(html).not.toContain('Allow analytics and continue'); });
});
