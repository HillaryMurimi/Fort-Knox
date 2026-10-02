import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LaunchReadiness } from '@/components/launch-readiness';
import { reviewInput, type LaunchReadinessItem } from './launch-readiness';

const state = vi.hoisted(() => ({ admin: true, pending: false, failed: false, query: vi.fn() }));
const item: LaunchReadinessItem = { key: 'BUSINESS_REGISTRATION', name: 'Business registration', group: 'Business', needsStaging: false, optional: false, revision: 3, onboarding: 'AWAITING_DOCUMENTS', staging: 'NOT_APPLICABLE', responsibleOwner: 'Release owner', targetDate: '2026-11-01', nextAction: 'Await approval', blocker: 'Document pending', severity: 'HIGH', verificationNote: '', configuration: 'NOT_APPLICABLE', verifiedAt: null, modifiedBy: 'actor', updatedAt: null, issues: ['Unresolved blocker'], ready: false };
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { isPlatformAdmin: state.admin } }) }));
vi.mock('@/hooks/queries/use-platform-queries', () => ({
  useLaunchReadinessQuery: (enabled: boolean) => { state.query(enabled); return { isPending: state.pending, isError: state.failed, isFetching: false, refetch: vi.fn(), data: { environment: 'test', generatedAt: '2026-10-01T12:00:00Z', items: [item], summary: { total: 1, ready: 0, blockers: 1, unassigned: 0 } } }; },
  useUpdateLaunchReadinessMutation: vi.fn(),
}));
afterEach(() => { state.admin = true; state.pending = false; state.failed = false; state.query.mockClear(); });

describe('launch readiness dashboard', () => {
  it('renders actual owners and blockers with configuration limitations', () => {
    const html = renderToStaticMarkup(createElement(LaunchReadiness));
    for (const text of ['Business registration', 'Release owner', 'Document pending', 'Await approval', '2026-11-01', 'credential presence only', 'manual reviews']) expect(html).toContain(text);
    expect(state.query).toHaveBeenCalledWith(true);
  });
  it('disables fetching and hides review data for organization users', () => {
    state.admin = false;
    const html = renderToStaticMarkup(createElement(LaunchReadiness));
    expect(state.query).toHaveBeenCalledWith(false);
    expect(html).toContain('SUPER_ADMIN access required');
    expect(html).not.toContain('Document pending');
  });
  it('shows recoverable load errors and loading placeholders', () => {
    state.failed = true;
    expect(renderToStaticMarkup(createElement(LaunchReadiness))).toContain('Retry');
    state.failed = false; state.pending = true;
    expect(renderToStaticMarkup(createElement(LaunchReadiness))).toContain('animate-pulse');
  });
  it('submits only editable review fields and the current revision', () => {
    const input = reviewInput(item);
    expect(input.expectedRevision).toBe(3);
    for (const key of ['key', 'configuration', 'ready', 'modifiedBy', 'verifiedAt', 'updatedAt', 'issues']) expect(input).not.toHaveProperty(key);
    input.responsibleOwner = 'Another owner';
    expect(item.responsibleOwner).toBe('Release owner');
  });
});
