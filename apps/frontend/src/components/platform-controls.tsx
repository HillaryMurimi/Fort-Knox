'use client';
import { StatusBadge } from '@/components/ui';
import { useState } from 'react';
import { usePlatformSwitchesQuery, usePlatformSwitchMutation } from '@/hooks/queries/use-platform-queries';
import type { PlatformSwitch, PlatformSwitchMode } from '@/lib/data/platform';
import { platformSwitchesShape, platformResponseError } from '@/lib/data/platform-control-shapes';

export function PlatformControls() {
  const query = usePlatformSwitchesQuery();
  const mutation = usePlatformSwitchMutation();
  const [selected, setSelected] = useState<PlatformSwitch | null>(null);
  const [mode, setMode] = useState<PlatformSwitchMode>('OFF');
  const [reason, setReason] = useState('');
  const [ready, setReady] = useState(false);
  function choose(item: PlatformSwitch, next: PlatformSwitchMode) {
    setSelected(item); setMode(next); setReason(''); setReady(false);
  }
  async function save() {
    if (!selected) return;
    await mutation.mutateAsync({ key: selected.key, mode, reason });
    setSelected(null);
  }
  if (query.data !== undefined && !platformSwitchesShape.safeParse(query.data).success) return <section role="alert" className="space-y-3"><p>{platformResponseError}</p><button className="rounded border px-3 py-2" onClick={() => void query.refetch()}>Retry controls</button></section>;
  return <section className="space-y-4"><h2 className="text-xl font-semibold">Service and feature controls</h2><p className="text-sm text-muted-foreground">New controls default OFF. Changes apply platform-wide. Existing records, administrator access and payment callbacks are preserved.</p>
    {query.isLoading && <p>Loading controls...</p>}
    {query.error && <p role="alert">{query.error.message}</p>}
    <div className="grid gap-4 md:grid-cols-2">{(query.data ?? []).map(item => <article key={item.key} className="rounded-xl border border-border bg-card p-5"><div className="flex justify-between gap-3"><h3 className="font-semibold">{item.name}</h3><StatusBadge status={item.mode} domain="integration" /></div><p className="mt-2 text-sm text-muted-foreground">{item.description}</p><p className="mt-2 text-xs">{item.key} / {item.environment}</p><p className="mt-2 text-sm">{item.reason}</p><p className="mt-2 text-xs text-muted-foreground">{item.modifiedAt ? new Date(item.modifiedAt).toLocaleString() : 'Default release gate'}{item.modifiedBy ? ' / Actor: ' + item.modifiedBy : ''}</p><div className="mt-4 flex flex-wrap gap-2">{(['ON', 'OFF', 'MAINTENANCE'] as const).map(next => <button key={next} type="button" disabled={item.mode === next || mutation.isPending} onClick={() => choose(item, next)} className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-40">{next === 'ON' ? 'Turn ON' : next === 'OFF' ? 'Turn OFF' : 'Maintenance'}</button>)}</div></article>)}</div>
    {selected && <div role="dialog" aria-modal="true" aria-label="Confirm control change" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-lg rounded-xl bg-card p-6"><h3 className="font-semibold">{mode}: {selected.name}</h3><p className="mt-2 text-sm">This affects this operation across all organizations. Other switches remain unchanged.</p><label className="mt-4 block text-sm">Reason<textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={1000} className="mt-2 w-full rounded border bg-background p-2" /></label>{mode === 'ON' && <label className="mt-3 flex gap-2 text-sm"><input type="checkbox" checked={ready} onChange={e => setReady(e.target.checked)} />I have verified configuration, security and readiness for this operation.</label>}{mutation.error && <p role="alert" className="mt-3">{mutation.error.message}</p>}<div className="mt-5 flex justify-end gap-3"><button onClick={() => setSelected(null)}>Cancel</button><button disabled={mutation.isPending || reason.trim().length < 3 || (mode === 'ON' && !ready)} onClick={() => void save()} className="rounded border px-4 py-2 disabled:opacity-40">Confirm {mode}</button></div></div></div>}
  </section>;
}
