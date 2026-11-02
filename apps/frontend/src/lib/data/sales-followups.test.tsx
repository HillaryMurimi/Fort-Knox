import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SalesCustomerFollowups } from '@/components/sales/sales-customer-followups';
import type { Customer } from './sales-success';
const state = vi.hoisted(() => ({ admin: true, permissions: [] as string[], error: false }));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ isDevMode: false, user: { _id: 'reviewer' }, roles: state.admin ? ['SUPER_ADMIN'] : [], memberships: [{ permissions: state.permissions }] }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }), useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data: { automationEnabled: false, items: queryKey.includes('followups') ? [{ _id: 'plan', trigger: 'CUSTOMER_REQUESTED', status: 'ESCALATED', revision: 1, sourceKind: '<script>untrusted</script>', nextContactAt: '2026-11-02T07:00:00Z', expiresAt: '2026-11-09T07:00:00Z', reasonCode: 'MESSAGE_OUTCOME_UNCERTAIN_NO_RESEND', steps: [{ index: 0, status: 'AWAITING_MESSAGE_REVIEW', messageId: 'draft-proof' }] }] : [] }, isLoading: false, error: state.error ? new Error('Current evidence unavailable') : null }) }));
const customer: Customer = { id: 'customer', name: 'Owner', reference: 'OWN', properties: 1, units: '40', challenge: 'Migration', source: 'Manual', stage: 'NEW', leadStatus: 'New', consent: 'UNKNOWN', revision: 3 };
describe('governed follow-up controls', () => {
  it('distinguishes uncertainty, draft review and disabled automation, escaping source labels', () => {
    state.admin = true; state.error = false;
    const html = renderToStaticMarkup(<SalesCustomerFollowups customer={customer}/>);
    expect(html).toContain('Each message requires fresh human approval'); expect(html).toContain('uncertain attempts require manual review'); expect(html).toContain('message outcome uncertain no resend'); expect(html).toContain('draft-proof'); expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>'); expect(html).toContain('Off; enrollment and new drafts are blocked'); expect(html).toContain('Create draft policy'); expect(html).toContain('Choose sequence action');
  });
  it('keeps read-only history without mutation forms', () => {
    state.admin = false; state.permissions = ['sales.followups.read'];
    const html = renderToStaticMarkup(<SalesCustomerFollowups customer={customer}/>);
    expect(html).toContain('draft-proof'); expect(html).not.toContain('Apply sequence control'); expect(html).not.toContain('Enroll follow-up'); expect(html).not.toContain('Create draft policy');
  });
  it('withholds linked onboarding evidence without its constituent permission', () => {
    state.admin = false; state.permissions = ['sales.followups.read'];
    expect(renderToStaticMarkup(<SalesCustomerFollowups customer={{ ...customer, organizationId: 'linked' }}/>)).toBe('');
  });
  it('provides explicit failures and retry controls', () => {
    state.admin = true; state.error = true;
    const html = renderToStaticMarkup(<SalesCustomerFollowups customer={customer}/>);
    expect(html).toContain('Current evidence unavailable'); expect(html).toContain('Retry follow-ups');
    state.error = false;
  });
});
