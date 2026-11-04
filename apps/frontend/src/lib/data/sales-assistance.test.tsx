import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SalesCustomerAssistance } from '@/components/sales/sales-customer-assistance';
import type { Customer } from './sales-success';
const state = vi.hoisted(() => ({ admin: true, permissions: [] as string[], error: false, status: 'REQUESTED', dev: false }));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ isDevMode: state.dev, user: { _id: 'reviewer' }, roles: state.admin ? ['SUPER_ADMIN'] : [], memberships: [{ permissions: state.permissions }] }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }), useQuery: () => ({ data: { total: 1, items: [{ _id: 'request', source: 'INTERNAL_ASSISTANCE', status: state.status, assignedTo: 'reviewer', guidance: '<script>untrusted recommendation</script>', revision: 0, createdAt: '2026-11-04T07:00:00Z' }] }, error: state.error ? new Error('Assistance unavailable') : null, isLoading: false }) }));
const customer: Customer = { id: 'customer', name: 'Owner', reference: 'OWN', properties: 1, units: '40', challenge: 'Migration', source: 'Manual', stage: 'NEW', leadStatus: 'New', consent: 'UNKNOWN', revision: 0, organizationId: 'linked' };
describe('onboarding assistance UI', () => {
  it('labels internal guidance, escapes untrusted content and exposes valid controls', () => {
    state.admin = true; state.error = false; state.status = 'REQUESTED'; state.dev = false;
    const html = renderToStaticMarkup(<SalesCustomerAssistance customer={customer} />);
    expect(html).toContain('Internal recommendation'); expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>');
    expect(html).toContain('Start work'); expect(html).not.toContain('Record completion'); expect(html).toContain('Assign representative');
  });
  it('withholds notes without all read permissions and mutation controls from read-only staff', () => {
    state.admin = false; state.permissions = ['sales.onboarding.read'];
    expect(renderToStaticMarkup(<SalesCustomerAssistance customer={customer} />)).toBe('');
    state.permissions.push('sales.notes.read');
    const html = renderToStaticMarkup(<SalesCustomerAssistance customer={customer} />);
    expect(html).toContain('Internal recommendation'); expect(html).not.toContain('Save assistance update');
  });
  it('shows terminal outcomes without controls and provides retry feedback', () => {
    state.admin = true; state.status = 'COMPLETED'; state.error = true;
    const html = renderToStaticMarkup(<SalesCustomerAssistance customer={customer} />);
    expect(html).not.toContain('Save assistance update'); expect(html).toContain('Retry assistance'); expect(html).toContain('Assistance unavailable');
    state.error = false; state.dev = true;
    expect(renderToStaticMarkup(<SalesCustomerAssistance customer={customer} />)).toBe(''); state.dev = false;
  });
});
