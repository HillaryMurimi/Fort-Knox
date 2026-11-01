import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SalesCustomerOutreach } from '@/components/sales/sales-customer-outreach';
import { SalesUnsubscribe } from '@/components/sales/sales-unsubscribe';
import type { Customer } from './sales-success';
const state = vi.hoisted(() => ({ admin: true, permissions: [] as string[] }));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ isDevMode: false, user: { _id: 'reviewer' }, roles: state.admin ? ['SUPER_ADMIN'] : [], memberships: [{ permissions: state.permissions }] }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }), useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data: { items: queryKey.includes('consents') ? [{ _id: 'consent', channel: 'EMAIL', decision: 'OPT_IN', evidence: '<script>untrusted evidence</script>', createdAt: '2026-11-01T00:00:00Z' }] : [] }, isLoading: false, error: null }) }));
const customer: Customer = { id: 'customer', name: 'Owner', reference: 'OWN', email: 'owner@example.test', properties: 1, units: '40', challenge: 'Migration assistance', source: 'Manual', stage: 'NEW', leadStatus: 'New', consent: 'UNKNOWN', revision: 3 };
describe('customer outreach review', () => {
  it('shows consent evidence safely and explains approval and delivery limits', () => {
    state.admin = true; const html = renderToStaticMarkup(<SalesCustomerOutreach customer={customer}/>);
    expect(html).toContain('&lt;script&gt;untrusted evidence&lt;/script&gt;'); expect(html).not.toContain('<script>');
    expect(html).toContain('fresh administrator review'); expect(html).toContain('Delivery does not confirm'); expect(html).toContain('Record consent evidence'); expect(html).toContain('Correct primary contact');
  });
  it('hides administrative mutation forms from read-only delegates', () => {
    state.admin = false; state.permissions = ['sales.outreach.read', 'sales.notes.read'];
    const html = renderToStaticMarkup(<SalesCustomerOutreach customer={customer}/>);
    expect(html).toContain('Recorded conversation'); expect(html).not.toContain('Record consent evidence'); expect(html).not.toContain('Prepare email for review'); expect(html).not.toContain('Correct primary contact');
  });
  it('withholds the entire panel when no outreach permission exists', () => {
    state.admin = false; state.permissions = [];
    expect(renderToStaticMarkup(<SalesCustomerOutreach customer={customer}/>)).toBe('');
  });
  it('requires explicit public confirmation and does not expose the bearer token in markup', () => {
    const html = renderToStaticMarkup(<SalesUnsubscribe token={'a'.repeat(43)}/>);
    expect(html).toContain('Confirm stop sales updates'); expect(html).toContain('security alerts'); expect(html).not.toContain('a'.repeat(43)); expect(html).not.toContain('Saving preference');
  });
});
