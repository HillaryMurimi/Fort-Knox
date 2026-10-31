import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SalesAgentControl } from '@/components/sales/sales-agent-control';
import { salesAgentClient } from './sales-agents';
const mocks = vi.hoisted(() => ({ auth: { roles: ['SUPER_ADMIN'], isDevMode: false, user: { _id: 'admin' }, memberships: [] as { permissions: string[] }[] }, api: vi.fn().mockResolvedValue({}) }));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/lib/api', () => ({ api: mocks.api }));
const render = () => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><SalesAgentControl /></QueryClientProvider>);
describe('operational sales agent controls', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.auth.roles = ['SUPER_ADMIN']; mocks.auth.isDevMode = false; mocks.auth.memberships = []; });
  it('distinguishes proposals from sends and shows persistent execution history', () => { const html = render(); expect(html).toContain('Approval alone does not send outreach'); expect(html).toContain('Execution history &amp; approvals'); });
  it('denies ordinary accounts and preview mode', () => { mocks.auth.roles = ['LANDLORD']; expect(render()).toContain('Explicit agent-read permission'); mocks.auth.roles = ['SUPER_ADMIN']; mocks.auth.isDevMode = true; expect(render()).toContain('Explicit agent-read permission'); expect(mocks.api).not.toHaveBeenCalled(); });
  it('posts exact approval hash and configuration through existing secured APIs', async () => { const body = { decision: 'APPROVE', payloadHash: 'a'.repeat(64), reason: 'Reviewed exact text' }; await salesAgentClient.decide('approval', body); expect(mocks.api).toHaveBeenCalledWith('/sales/success/approvals/approval/decisions', { method: 'POST', body: JSON.stringify(body) }); });
});
