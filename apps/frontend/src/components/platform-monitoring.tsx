'use client';
import { useState, type FormEvent } from 'react';
import { RefreshCw, ShieldCheck, Activity, Bell, ListChecks } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { monitoringOverviewShape, platformResponseError } from '@/lib/data/platform-control-shapes';
import { useMonitoringOverview, useMonitoringAlerts, useMonitoringHistory, useMonitoringAction, useMaintenanceWindows } from '@/hooks/queries/use-platform-monitoring';
import { monitorValue, type MonitorAreaKey, type MonitoringAlert, type AlertReview } from '@/lib/data/platform-monitoring';
import { Alert, Badge, Button, Card, Dialog, Input, Label, Select, Skeleton, Textarea } from '@/components/ui';
type OrganizationOption = { _id: string; name: string };
const areas: MonitorAreaKey[] = ['launch', 'switches', 'system', 'onboarding', 'queues', 'notifications', 'security'];
const human = (value: string) => value.toLowerCase().replaceAll('_', ' ');
const date = (value?: string | null) => value ? new Date(value).toLocaleString() : 'Not recorded';
const tone = (value: string) => value === 'HEALTHY' || value === 'RESOLVED' ? 'green' as const : value === 'BLOCKED' || value === 'CRITICAL' ? 'red' as const : value === 'NOT_CONFIGURED' ? 'neutral' as const : 'orange' as const;

export function PlatformMonitoring({ organizations = [], onScope }: { organizations?: OrganizationOption[]; onScope?: (id: string) => void }) {
  const admin = Boolean(useAuth().user?.isPlatformAdmin);
  const overview = useMonitoringOverview(admin);
  const [area, setArea] = useState('');
  const [status, setStatus] = useState('OPEN');
  const [scope, setScope] = useState('');
  const [page, setPage] = useState(1);
  const alerts = useMonitoringAlerts({ page, ...(area ? { area } : {}), ...(status ? { status } : {}), ...(scope ? { scope } : {}) }, admin);
  const windows = useMaintenanceWindows(admin);
  const action = useMonitoringAction();
  const [selected, setSelected] = useState<MonitoringAlert | null>(null);
  const [creatingWindow, setCreatingWindow] = useState(false);
  const scopeName = (id: string) => id === 'PLATFORM' ? 'Platform / unknown scope' : organizations.find(item => item._id === id)?.name ?? id;
  if (!admin) return <Alert tone="destructive">SUPER_ADMIN access required.</Alert>;
  if (overview.isPending) return <Skeleton className="h-80 w-full" />;
  if (overview.isError || !overview.data) return <Alert tone="destructive">Monitoring data unavailable. <Button variant="outline" onClick={() => void overview.refetch()}>Retry</Button></Alert>;
  const data = overview.data;
  if (!monitoringOverviewShape.safeParse(data).success) return <Alert tone="destructive">{platformResponseError} <Button variant="outline" onClick={() => void overview.refetch()}>Retry monitoring</Button></Alert>;
  const refresh = () => { void overview.refetch(); void alerts.refetch(); void windows.refetch(); };
  return <section className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-semibold"><Activity size={22} />Platform monitoring</h2><p className="mt-1 text-sm text-muted-foreground">Health, blockers, affected organizations and action ownership.</p></div><div className="flex items-center gap-3"><Badge tone="blue">{data.environment}</Badge><Button variant="outline" loading={overview.isFetching} onClick={refresh}><RefreshCw size={15} />Refresh</Button></div></header>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[{ key: 'HEALTHY', label: 'Healthy areas', Icon: ShieldCheck }, { key: 'BLOCKED', label: 'Blocked areas', Icon: Bell }, { key: 'NEEDS_ACTION', label: 'Areas needing action', Icon: Activity }, { key: 'NOT_CONFIGURED', label: 'Areas with missing data', Icon: ListChecks }].map(({ key, label, Icon }) => <Card key={key} className="p-5"><div className="flex justify-between"><div><div className="text-2xl font-semibold">{data.areas.filter(item => key === 'NOT_CONFIGURED' ? item.metrics.some(value => value.value === null) : item.status === key).length}</div><div className="text-sm text-muted-foreground">{label}</div></div><Icon size={20} /></div></Card>)}</div>
    <Alert tone={data.collector?.status === 'RUNNING' ? 'default' : 'warning'}>Alert collector: {data.collector ? human(data.collector.status) : 'Not configured'}. Last successful collection: {date(data.collector?.lastSuccessAt)}. Sources are refreshed live; persistent alerts require the worker, database indexes and replica-set transactions.</Alert>
    <div className="grid gap-4 xl:grid-cols-2">{data.areas.map(item => <Card key={item.key} className="space-y-4 p-5">
      <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{item.title}</h3><Badge tone={tone(item.status)}>{human(item.status)}</Badge></div>
      <dl className="grid gap-3 sm:grid-cols-2">{item.metrics.map(value => <div key={value.key} className="rounded-md bg-muted p-3"><dt className="text-xs text-muted-foreground">{value.label}</dt><dd className="mt-1 break-words text-lg font-semibold">{monitorValue(value.value)}</dd><dd className="mt-1 text-[11px] text-muted-foreground">{value.source} · {value.window}</dd></div>)}</dl>
      {item.conditions.length > 0 && <p className="text-sm text-[var(--warning-text)]">{item.conditions.length} measured condition(s) need action. Affected scopes: {[...new Set(item.conditions.map(condition => scopeName(condition.scope)))].slice(0, 4).join(', ')}{new Set(item.conditions.map(condition => condition.scope)).size > 4 ? '…' : ''}.</p>}
      {item.truncated && <Alert tone="warning">Scope or job-type results are capped. Totals remain labelled; automatic alert resolution is suspended for this area until the source is complete.</Alert>}
      <details className="text-xs text-muted-foreground"><summary className="cursor-pointer font-medium">Sources and limitations</summary>{item.notes.map(note => <p key={note} className="mt-2">{note}</p>)}</details>
    </Card>)}</div>
    <Card className="space-y-4 p-5">
      <div><h3 className="font-semibold">Action queue</h3><p className="mt-1 text-sm text-muted-foreground">Deduplicated alerts retain ownership and history. Resolving a still-active condition allows the collector to reopen it.</p></div>
      <div className="grid gap-3 sm:grid-cols-3"><div><Label htmlFor="monitor-area">Area</Label><Select id="monitor-area" value={area} onChange={e => { setArea(e.target.value); setPage(1); }}><option value="">All areas</option>{areas.map(key => <option key={key} value={key}>{human(key)}</option>)}</Select></div><div><Label htmlFor="monitor-status">Status</Label><Select id="monitor-status" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option>{['OPEN', 'ACKNOWLEDGED', 'RESOLVED'].map(key => <option key={key} value={key}>{human(key)}</option>)}</Select></div><div><Label htmlFor="monitor-scope">Affected scope</Label><Select id="monitor-scope" value={scope} onChange={e => { setScope(e.target.value); setPage(1); }}><option value="">All scopes</option><option value="PLATFORM">Platform / unknown</option>{organizations.map(org => <option key={org._id} value={org._id}>{org.name}</option>)}</Select></div></div>
      {alerts.isPending && <Skeleton className="h-32" />}
      {alerts.isError && <Alert tone="warning">Alert records unavailable. No empty or healthy state has been inferred. <Button variant="outline" onClick={() => void alerts.refetch()}>Retry</Button></Alert>}
      {alerts.data && <><p className="text-xs text-muted-foreground">{alerts.data.total} matching alerts · page {page}</p>{!alerts.data.items.length && <p className="py-4 text-sm text-muted-foreground">No recorded alerts match these filters. Check collector status before interpreting this as healthy.</p>}
      <div className="space-y-3">{alerts.data.items.map(item => <article key={item._id} className="space-y-3 rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-medium">{item.title}</h4><div className="flex gap-2"><Badge tone={tone(item.severity)}>{human(item.severity)}</Badge><Badge tone={tone(item.status)}>{human(item.status)}</Badge>{item.suppressed && <Badge tone="blue">Maintenance window</Badge>}</div></div>
        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2"><p>Affected: {item.scope !== 'PLATFORM' && onScope ? <button className="font-medium underline" onClick={() => onScope(item.scope)}>{scopeName(item.scope)}</button> : scopeName(item.scope)}</p><p>Owner: {item.owner || 'Unassigned'}</p><p>First occurrence: {date(item.firstAt)}</p><p>Last occurrence: {date(item.lastAt)}</p><p>Acknowledged: {date(item.acknowledgedAt)}{item.acknowledgedBy ? ' · ' + item.acknowledgedBy : ''}</p><p>Resolved: {date(item.resolvedAt)}{item.resolvedBy ? ' · ' + item.resolvedBy : ''}</p><p>Observed records/events: {item.observedValue ?? 'Not configured'}</p></div>
        <Button size="sm" variant="outline" onClick={() => setSelected(item)}>Owner, acknowledgement and history</Button>
      </article>)}</div><div className="flex justify-end gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page * alerts.data.pageSize >= alerts.data.total} onClick={() => setPage(page + 1)}>Next</Button></div></>}
    </Card>
    <Card className="space-y-4 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Maintenance windows</h3><p className="text-sm text-muted-foreground">Suppress alert creation, reopening and automatic resolution for a selected area and scope. Metrics and services remain active.</p></div><Button variant="outline" onClick={() => setCreatingWindow(true)}>Add window</Button></div>
      {windows.isPending && <Skeleton className="h-16" />}{windows.isError && <Alert tone="warning">Maintenance-window records unavailable.</Alert>}
      {windows.data && !windows.data.length && <p className="text-sm text-muted-foreground">No pending or active maintenance windows.</p>}
      {windows.data?.map(window => <div key={window._id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"><div><div className="font-medium">{human(window.area)} · {window.scope === 'PLATFORM' ? 'All scopes in this area' : scopeName(window.scope)}</div><p>{window.reason}</p><p className="text-xs text-muted-foreground">{date(window.startsAt)} → {date(window.endsAt)} · Owner: {window.owner}</p></div><Button variant="outline" size="sm" loading={action.isPending} onClick={() => action.mutate({ operation: 'END_WINDOW', id: window._id })}>End window</Button></div>)}
      {action.isError && <Alert tone="destructive">{action.error.message}</Alert>}
    </Card>
    <Card className="space-y-4 p-5"><h3 className="font-semibold">Service state and enforcement coverage</h3><p className="text-sm text-muted-foreground">Dependencies are documented operational relationships; they do not automatically toggle other services. Attempt counts cover instrumented switch guards over the last 24 hours.</p>
      {!data.switches && <Alert tone="warning">Switch monitoring not configured or unavailable.</Alert>}
      <div className="grid gap-3 lg:grid-cols-2">{data.switches?.map(item => <div key={item.key} className="space-y-2 rounded-lg border p-4 text-sm"><div className="flex justify-between gap-2"><h4 className="font-medium">{item.name}</h4><Badge tone={item.mode === 'ON' ? 'green' : 'orange'}>{item.mode}</Badge></div><p>{item.reason}</p><p className="text-xs text-muted-foreground">Last change: {date(item.modifiedAt)} · Actor: {item.modifiedBy || 'Not recorded'}</p><p className="text-xs">Disabled attempts: {monitorValue(item.disabledAttempts)} · Coverage: {human(item.coverage)}</p><p className="text-xs">Enforced boundaries: {item.boundaries}</p><p className="text-xs">Dependencies: {item.dependencies.length ? item.dependencies.map(dependency => dependency.key + ' (' + dependency.mode + ')').join(', ') : 'None declared'}</p><p className="text-xs text-muted-foreground">{item.limitation}</p></div>)}</div>
    </Card>
    <p className="text-xs text-muted-foreground">Snapshot {date(data.generatedAt)}. Revenue and wider integration monitoring remain unavailable until their records and calculations are operational.</p>
    {selected && <AlertEditor item={selected} onClose={() => setSelected(null)} />}
    {creatingWindow && <WindowEditor organizations={organizations} onClose={() => setCreatingWindow(false)} />}
  </section>;
}

function AlertEditor({ item, onClose }: { item: MonitoringAlert; onClose: () => void }) {
  const [owner, setOwner] = useState(item.owner);
  const [note, setNote] = useState('');
  const [operation, setOperation] = useState<AlertReview['action']>('ASSIGN');
  const [historyPage, setHistoryPage] = useState(1);
  const history = useMonitoringHistory(item._id, historyPage);
  const mutation = useMonitoringAction();
  async function submit(event: FormEvent) { event.preventDefault(); try { await mutation.mutateAsync({ operation: 'REVIEW', id: item._id, input: { expectedRevision: item.revision, owner, note, action: operation } }); onClose(); } catch { /* Preserve edits and show server error. */ } }
  const actions: AlertReview['action'][] = ['ASSIGN', ...(item.status === 'OPEN' ? ['ACKNOWLEDGE' as const] : []), ...(item.status === 'RESOLVED' ? ['REOPEN' as const] : ['RESOLVE' as const])];
  return <Dialog open onOpenChange={open => { if (!open && !mutation.isPending) onClose(); }} title={item.title} description="Record ownership and an operator action. Do not paste credentials, OTPs or personal customer content.">
    <form className="space-y-4" onSubmit={submit}><div><Label htmlFor="alert-owner">Responsible owner</Label><Input id="alert-owner" maxLength={120} value={owner} onChange={e => setOwner(e.target.value)} /></div><div><Label htmlFor="alert-action">Action</Label><Select id="alert-action" value={operation} onChange={e => setOperation(e.target.value as AlertReview['action'])}>{actions.map(value => <option key={value} value={value}>{human(value)}</option>)}</Select></div><div><Label htmlFor="alert-note">Action note</Label><Textarea id="alert-note" required minLength={3} maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></div>
      {mutation.isError && <Alert tone="destructive">{mutation.error.message} If the alert changed, close and refresh before retrying.</Alert>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>Cancel</Button><Button loading={mutation.isPending}>Record change</Button></div>
    </form><div className="mt-6 space-y-3 border-t pt-4"><h4 className="font-semibold">Acknowledgement and resolution history</h4>{history.isPending && <Skeleton className="h-20" />}{history.isError && <Alert tone="warning">History unavailable.</Alert>}{history.data?.items.map(event => <div key={event._id} className="rounded-md bg-muted p-3 text-xs"><div className="font-medium">{human(event.action)} · {date(event.at)}</div><p className="mt-1">{event.note}</p><p className="mt-1 text-muted-foreground">Actor: {event.actor || 'System collector'} · Owner: {event.owner || 'Unassigned'} · {event.before ? human(event.before) + ' → ' : ''}{event.after ? human(event.after) : ''}</p></div>)}{history.data && <div className="flex justify-end gap-2"><Button size="sm" variant="outline" disabled={historyPage <= 1} onClick={() => setHistoryPage(historyPage - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={historyPage * history.data.pageSize >= history.data.total} onClick={() => setHistoryPage(historyPage + 1)}>Next</Button></div>}</div>
  </Dialog>;
}
function WindowEditor({ organizations, onClose }: { organizations: OrganizationOption[]; onClose: () => void }) {
  const [area, setArea] = useState<MonitorAreaKey>('queues');
  const [scope, setScope] = useState('PLATFORM');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [owner, setOwner] = useState('');
  const [reason, setReason] = useState('');
  const mutation = useMonitoringAction();
  const [localError, setLocalError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setLocalError('');
    const startsAt = new Date(start), endsAt = new Date(end);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) { setLocalError('Choose valid start and end times.'); return; }
    try { await mutation.mutateAsync({ operation: 'CREATE_WINDOW', input: { area, scope, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), owner, reason } }); onClose(); } catch { /* Server validation is displayed. */ }
  }
  return <Dialog open onOpenChange={open => { if (!open && !mutation.isPending) onClose(); }} title="Schedule maintenance window" description="Times use this browser's timezone. Maximum duration: seven days. This suppresses alerts only.">
    <form onSubmit={submit} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="window-area">Area</Label><Select id="window-area" value={area} onChange={e => setArea(e.target.value as MonitorAreaKey)}>{areas.map(value => <option key={value}>{value}</option>)}</Select></div><div><Label htmlFor="window-scope">Affected scope</Label><Select id="window-scope" value={scope} onChange={e => setScope(e.target.value)}><option value="PLATFORM">All scopes in this area</option>{organizations.map(org => <option key={org._id} value={org._id}>{org.name}</option>)}</Select></div><div><Label htmlFor="window-start">Starts</Label><Input id="window-start" required type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></div><div><Label htmlFor="window-end">Ends</Label><Input id="window-end" required type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></div></div><div><Label htmlFor="window-owner">Responsible owner</Label><Input id="window-owner" required maxLength={120} value={owner} onChange={e => setOwner(e.target.value)} /></div><div><Label htmlFor="window-reason">Reason</Label><Textarea id="window-reason" required minLength={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></div>{(localError || mutation.isError) && <Alert tone="destructive">{localError || mutation.error?.message}</Alert>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>Cancel</Button><Button loading={mutation.isPending}>Schedule window</Button></div></form>
  </Dialog>;
}
