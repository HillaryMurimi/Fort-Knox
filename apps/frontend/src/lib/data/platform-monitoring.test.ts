import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlatformMonitoring } from '@/components/platform-monitoring';
import { monitorValue } from './platform-monitoring';
const state = vi.hoisted(() => ({ admin: true, error: false, pending: false, enabled: vi.fn() }));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { isPlatformAdmin: state.admin } }) }));
vi.mock('@/hooks/queries/use-platform-monitoring', () => ({
  useMonitoringOverview: (enabled: boolean) => { state.enabled(enabled); return { isError: state.error, isPending: state.pending, refetch: vi.fn(), data: { environment: 'test', generatedAt: '2026-10-01T12:00:00Z', collector: null, switches: null, areas: [{ key: 'queues', title: 'Queues', status: 'NOT_CONFIGURED', metrics: [{ key: 'queued', label: 'Queued jobs', value: 0, source: 'Job', window: 'Current records' }, { key: 'paused', label: 'Paused work', value: null, source: 'No paused state', window: 'Current records' }], notes: ['Actual records only'], conditions: [], truncated: false }] } }; },
  useMonitoringAlerts: vi.fn(() => ({ isError: true, isPending: false, refetch: vi.fn() })),
  useMaintenanceWindows: vi.fn(() => ({ isError: true, isPending: false, refetch: vi.fn() })),
  useMonitoringAction: vi.fn(() => ({ isPending: false, isError: false })),
  useMonitoringHistory: vi.fn(),
}));
afterEach(() => { state.admin = true; state.error = false; state.pending = false; state.enabled.mockClear(); });
describe('platform monitoring rendering', () => {
  it('keeps zero distinct from Not configured and shows source provenance', () => {
    expect(monitorValue(0)).toBe('0'); expect(monitorValue(null)).toBe('Not configured');
    const html = renderToStaticMarkup(createElement(PlatformMonitoring));
    for (const value of ['Queued jobs', 'Paused work', 'Not configured', 'Job', 'Current records', 'Actual records only', 'Alert records unavailable']) expect(html).toContain(value);
    expect(html).not.toContain('No recorded alerts match');
    expect(html).not.toContain('No pending or active maintenance windows');
  });
  it('disables fetching and hides platform data for organization users', () => {
    state.admin = false;
    const html = renderToStaticMarkup(createElement(PlatformMonitoring));
    expect(state.enabled).toHaveBeenCalledWith(false);
    expect(html).toContain('SUPER_ADMIN access required');
    expect(html).not.toContain('Queued jobs');
  });
  it('renders loading and retry states without invented healthy metrics', () => {
    state.pending = true;
    expect(renderToStaticMarkup(createElement(PlatformMonitoring))).toContain('animate-pulse');
    state.pending = false; state.error = true;
    const html = renderToStaticMarkup(createElement(PlatformMonitoring));
    expect(html).toContain('Retry'); expect(html).not.toContain('Healthy areas');
  });
});
