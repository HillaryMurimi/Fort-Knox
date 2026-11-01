import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SalesResearchEvidence } from '@/components/sales/sales-research-evidence';
import { salesAgentClient, type AgentRun, type AgentApproval } from './sales-agents';
const api = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock('@/lib/api', () => ({ api }));
const url = 'https://company.example.com/services';
const run: AgentRun = { _id: 'run', agent: 'LEAD_RESEARCHER', leadId: 'lead', status: 'COMPLETED', createdAt: '2026-11-01T00:00:00Z', attempt: 1, researchExpiresAt: '2099-11-01T00:00:00Z', researchSources: [{ title: 'Public company reference', url, excerpt: '<script>Untrusted source content</script>', provider: 'BRAVE', retrievedAt: '2026-11-01T00:00:00Z' }] };
const approval: AgentApproval = { _id: 'review', status: 'APPROVED', payloadHash: 'a'.repeat(64), risk: 'HIGH', expiresAt: '2099-11-01T00:00:00Z', requiredPermission: 'sales.leads.read', payload: { tool: 'LEAD_PROPOSAL', text: 'Review prospect fit', reason: 'Permitted source reference', subject: null, sourceUrls: [url] } };
const render = (canImport = true, value = run) => renderToStaticMarkup(<SalesResearchEvidence run={value} approval={approval} canImport={canImport} busy={false} onImport={async () => {}} />);
describe('reviewed research evidence', () => {
  it('shows provenance and limitations, escapes source text and requires manually reviewed prospect fields', () => { const html = render(); expect(html).toContain('Permitted-source evidence (unverified)'); expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>'); expect(html).toContain('rel="noopener noreferrer"'); expect(html).toContain('Import with unknown consent'); expect(html).toContain('do not invent counts'); });
  it('keeps references readable while withholding import controls from delegates', () => { const html = render(false); expect(html).toContain('Public company reference'); expect(html).not.toContain('Import reviewed prospect'); });
  it('hides expired source content and import forms', () => { const html = render(true, { ...run, researchExpiresAt: '2000-01-01T00:00:00Z' }); expect(html).toContain('Research evidence expired'); expect(html).not.toContain('Public company reference'); expect(html).not.toContain('Import reviewed prospect'); });
  it('uses the existing secured transport and exact reviewed hash for import', async () => { const body = { payloadHash: approval.payloadHash, sourceUrl: url, customer: { name: 'Reviewed business' } }; await salesAgentClient.importResearch('review', body); expect(api).toHaveBeenCalledWith('/sales/success/approvals/review/import-customer', { method: 'POST', body: JSON.stringify(body) }); });
});
