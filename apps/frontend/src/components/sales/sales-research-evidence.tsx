'use client';
import { useEffect, useState } from 'react';
import { Alert, Button } from '@/components/ui';
import type { AgentRun, AgentApproval } from '@/lib/data/sales-agents';
const field = 'mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm';
export function SalesResearchEvidence({ run, approval, canImport, busy, onImport }: {
  run: AgentRun; approval: AgentApproval | null; canImport: boolean; busy: boolean;
  onImport: (approvalId: string, body: unknown) => Promise<void>;
}) {
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const expiry = Date.parse(run.researchExpiresAt ?? '');
    if (!Number.isFinite(expiry) || clock >= expiry) return;
    const timer = setTimeout(() => setClock(Date.now()), Math.min(2147483647, Math.max(0, expiry - Date.now() + 1)));
    return () => clearTimeout(timer);
  }, [run.researchExpiresAt, clock]);
  if (run.researchExpiresAt && Date.parse(run.researchExpiresAt) <= clock) return <Alert>Research evidence expired. Run and review research again before importing.</Alert>;
  const sources = run.researchSources ?? [], action = approval?.payload ?? run.output?.action;
  if (!sources.length) return null;
  return <section aria-label="Research evidence review" className="space-y-4">
    <details className="rounded-xl border border-border p-4">
      <summary className="cursor-pointer font-semibold">Permitted-source evidence (unverified)</summary>
      <p className="mt-2 text-xs text-muted-foreground">Source references do not prove ownership, portfolio size, contact accuracy or outreach consent. Request cost: configured estimate {run.researchCostMicroUsd ?? 0} micro USD.</p>
      {run.researchExpiresAt && <p className="text-xs text-muted-foreground">Research content and generated proposals expire {new Date(run.researchExpiresAt).toLocaleString()}. Decision hashes remain in audit.</p>}
      <ul className="mt-3 space-y-4">{sources.map(s => <li key={s.url}>
        <a className="break-words underline" href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>
        <p className="text-sm">{s.excerpt}</p><p className="text-xs text-muted-foreground">{s.provider} - retrieved {new Date(s.retrievedAt).toLocaleString()}</p>
      </li>)}</ul>
    </details>
    {canImport && approval && ['APPROVED', 'COMPLETED'].includes(approval.status) && action?.tool === 'LEAD_PROPOSAL' && !!action.sourceUrls.length && <form className="space-y-3 rounded-xl border border-border p-4" onSubmit={e => {
      e.preventDefault(); const f = new FormData(e.currentTarget), value = (key: string) => String(f.get(key) ?? '').trim();
      void onImport(approval._id, { payloadHash: approval.payloadHash, sourceUrl: value('sourceUrl'), customer: {
        name: value('name'), ...(value('email') ? { email: value('email') } : {}), ...(value('phone') ? { phone: value('phone') } : {}),
        properties: Number(f.get('properties')), units: value('units'), challenge: value('challenge'), source: 'Reviewed permitted research',
      } });
    }}>
      <h3 className="font-semibold">Import reviewed prospect</h3>
      <p className="text-sm text-muted-foreground">Verify these CRM fields before importing. Supply known property estimates; do not invent counts. Import does not grant outreach consent or link an organization. Existing contacts/accounts require duplicate review.</p>
      <label className="block text-sm">Approved source<select name="sourceUrl" aria-label="Approved research source" className={field}>{action.sourceUrls.filter(url => sources.some(s => s.url === url)).map(url => <option key={url}>{url}</option>)}</select></label>
      <label className="block text-sm">Reviewed company / customer name<input name="name" className={field} minLength={2} maxLength={160} required /></label>
      <label className="block text-sm">Public business email (optional)<input name="email" className={field} type="email" maxLength={240} /></label>
      <label className="block text-sm">Public business phone (optional, international)<input name="phone" className={field} pattern="\+[1-9][0-9]{7,14}" /></label>
      <label className="block text-sm">Reviewed property estimate<input name="properties" className={field} type="number" min={1} max={100000} required /></label>
      <label className="block text-sm">Reviewed unit estimate<input name="units" className={field} maxLength={40} required /></label>
      <label className="block text-sm">Known customer needs<textarea name="challenge" className={field} minLength={5} maxLength={5000} required /></label>
      <Button type="submit" disabled={busy}>Import with unknown consent</Button>
    </form>}
  </section>;
}
