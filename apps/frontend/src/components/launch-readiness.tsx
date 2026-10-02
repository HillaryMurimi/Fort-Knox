'use client';
import { useState, type FormEvent } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useLaunchReadinessQuery, useUpdateLaunchReadinessMutation } from '@/hooks/queries/use-platform-queries';
import { reviewInput, type LaunchReadinessItem, type ReadinessReviewInput } from '@/lib/data/launch-readiness';
import { Alert, Badge, Button, Card, Dialog, Input, Label, Select, Skeleton, Textarea } from '@/components/ui';

const human = (value: string) => value.toLowerCase().replaceAll('_', ' ');
export function LaunchReadiness() {
  const { user } = useAuth();
  const query = useLaunchReadinessQuery(Boolean(user?.isPlatformAdmin));
  const [selected, setSelected] = useState<LaunchReadinessItem | null>(null);
  const [attention, setAttention] = useState(false);
  if (!user?.isPlatformAdmin) return <Alert tone="destructive">SUPER_ADMIN access required.</Alert>;
  if (query.isPending) return <Skeleton className="h-72 w-full" />;
  if (query.isError) return <Alert tone="destructive">Readiness could not be loaded. <Button variant="outline" onClick={() => void query.refetch()}>Retry</Button></Alert>;
  const data = query.data;
  if (!data) return null;
  const items = data.items.filter(item => !attention || !item.ready);
  return <section className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Launch readiness</h2><p className="mt-1 text-sm text-muted-foreground">Provider approvals, staging reviews and release blockers.</p></div><div className="flex items-center gap-3"><Badge tone="blue">{data.environment}</Badge><Button variant="outline" loading={query.isFetching} onClick={() => void query.refetch()}><RefreshCw size={15} />Refresh</Button></div></header>
    <Alert>Configuration indicates credential presence only. Staging results are manual reviews. Readiness does not enable services or certify a production launch. Never paste credentials into review notes.</Alert>
    <div className="grid gap-3 sm:grid-cols-3">{[[`${data.summary.ready}/${data.summary.total}`, 'Items ready'], [data.summary.blockers, 'Unresolved blockers'], [data.summary.unassigned, 'Owners unassigned']].map(([value, label]) => <Card key={label} className="p-5"><div className="text-2xl font-semibold">{value}</div><div className="text-sm text-muted-foreground">{label}</div></Card>)}</div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={attention} onChange={event => setAttention(event.target.checked)} />Show items needing attention</label>
    {!items.length && <Card className="p-6 text-sm text-muted-foreground">No items match this filter.</Card>}
    <div className="grid gap-4 xl:grid-cols-2">{items.map(item => <Card key={item.key} className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3"><div><div className="text-xs text-muted-foreground">{item.group}{item.optional ? ' · Optional service' : ''}</div><h3 className="font-semibold">{item.name}</h3></div><Badge tone={item.ready ? 'green' : 'orange'}>{item.ready ? 'Ready' : 'Needs attention'}</Badge></div>
      <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted-foreground">Onboarding / approval</dt><dd className="capitalize">{human(item.onboarding)}</dd></div><div><dt className="text-xs text-muted-foreground">Configuration presence</dt><dd className="capitalize">{human(item.configuration)}</dd></div><div><dt className="text-xs text-muted-foreground">Staging review</dt><dd className="capitalize">{human(item.staging)}</dd></div><div><dt className="text-xs text-muted-foreground">Responsible owner</dt><dd>{item.responsibleOwner || 'Unassigned'}</dd></div><div><dt className="text-xs text-muted-foreground">Target date</dt><dd>{item.targetDate || 'Not scheduled'}</dd></div><div><dt className="text-xs text-muted-foreground">Last reviewed</dt><dd>{item.updatedAt ? new Date(item.updatedAt).toLocaleString() : 'Not reviewed'}</dd></div></dl>
      <p className="text-sm"><span className="font-medium">Next action: </span>{item.nextAction || 'Not specified'}</p>
      {item.blocker && <Alert tone={item.severity === 'CRITICAL' || item.severity === 'HIGH' ? 'destructive' : 'warning'} title={`${human(item.severity)} blocker`}>{item.blocker}</Alert>}
      {item.verificationNote && <p className="text-sm text-muted-foreground">Verification: {item.verificationNote}{item.verifiedAt ? ` · ${new Date(item.verifiedAt).toLocaleString()}` : ''}</p>}
      {!!item.issues.length && <p className="text-xs text-muted-foreground">{item.issues.join(' · ')}</p>}
      <Button variant="outline" onClick={() => setSelected(item)}>Review {item.name}</Button>
    </Card>)}</div>
    <p className="text-xs text-muted-foreground">Configuration refreshed {new Date(data.generatedAt).toLocaleString()}. Optional services are included in item counts; their readiness is not a requirement for every release.</p>
    {selected && <ReadinessEditor key={`${selected.key}:${selected.revision}`} item={selected} onClose={() => setSelected(null)} />}
  </section>;
}

function ReadinessEditor({ item, onClose }: { item: LaunchReadinessItem; onClose: () => void }) {
  const [input, setInput] = useState(() => reviewInput(item));
  const mutation = useUpdateLaunchReadinessMutation();
  const set = <K extends keyof ReadinessReviewInput>(key: K, value: ReadinessReviewInput[K]) => setInput(previous => ({ ...previous, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    try { await mutation.mutateAsync({ key: item.key, input }); onClose(); } catch { /* Mutation error is displayed; retain edits. */ }
  }
  return <Dialog open onOpenChange={open => { if (!open && !mutation.isPending) onClose(); }} title={`Review ${item.name}`} description="Save status and ownership only. Never enter passwords, tokens, API keys or connection strings.">
    <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={mutation.isPending} className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="readiness-owner">Responsible owner</Label><Input id="readiness-owner" maxLength={120} value={input.responsibleOwner} onChange={e => set('responsibleOwner', e.target.value)} /></div>
        <div><Label htmlFor="readiness-date">Target date</Label><Input id="readiness-date" type="date" value={input.targetDate ?? ''} onChange={e => set('targetDate', e.target.value || null)} /></div>
        <div><Label htmlFor="readiness-onboarding">Onboarding / approval</Label><Select id="readiness-onboarding" value={input.onboarding} onChange={e => set('onboarding', e.target.value as ReadinessReviewInput['onboarding'])}>{['NOT_STARTED', 'AWAITING_DOCUMENTS', 'SUBMITTED', 'APPROVED'].map(value => <option key={value} value={value}>{human(value)}</option>)}</Select></div>
        <div><Label htmlFor="readiness-staging">Staging review</Label><Select id="readiness-staging" value={input.staging} onChange={e => set('staging', e.target.value as ReadinessReviewInput['staging'])}>{(item.needsStaging ? ['NOT_TESTED', 'PASSED', 'FAILED'] : ['NOT_APPLICABLE']).map(value => <option key={value} value={value}>{human(value)}</option>)}</Select></div>
        <div className="sm:col-span-2"><Label htmlFor="readiness-action">Next action</Label><Textarea id="readiness-action" maxLength={300} value={input.nextAction} onChange={e => set('nextAction', e.target.value)} /></div>
        <div><Label htmlFor="readiness-severity">Blocker severity</Label><Select id="readiness-severity" value={input.severity} onChange={e => set('severity', e.target.value as ReadinessReviewInput['severity'])}>{['NONE', 'LOW', 'HIGH', 'CRITICAL'].map(value => <option key={value} value={value}>{human(value)}</option>)}</Select></div>
        <div><Label htmlFor="readiness-blocker">Unresolved blocker</Label><Textarea id="readiness-blocker" maxLength={500} value={input.blocker} onChange={e => set('blocker', e.target.value)} /></div>
        <div className="sm:col-span-2"><Label htmlFor="readiness-note">Verification summary</Label><Textarea id="readiness-note" maxLength={500} value={input.verificationNote} onChange={e => set('verificationNote', e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">A passed staging review requires an owner and a summary of at least 10 characters. State the check, outcome and evidence reference without credentials.</p></div>
      </fieldset>
      {mutation.isError && <Alert tone="destructive">{mutation.error.message} Close and refresh if another admin changed this item.</Alert>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>Cancel</Button><Button type="submit" loading={mutation.isPending}>Save review</Button></div>
    </form>
  </Dialog>;
}
