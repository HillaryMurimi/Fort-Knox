'use client';
import { useMemo, useState } from 'react';
import * as I from '@/components/icons';
import { Badge, EmptyState, PageTitle, SectionHeader, Stat } from '@/components/ui';
import { useOrganization } from '@/hooks/use-organization';
import { useNotificationsQuery, useNotificationPreferencesQuery, useNotificationPreferenceMutation, useNotificationReadMutation } from '@/hooks/queries/use-operations-queries';
import type { NotificationRecord } from '@/lib/data/resource-types';

const tone: Record<NotificationRecord['status'], 'neutral'|'green'|'orange'|'red'|'blue'> = { QUEUED:'orange', SENT:'blue', DELIVERED:'green', READ:'neutral', FAILED:'red', CANCELLED:'neutral' };
const channels: NotificationRecord['channel'][] = ['IN_APP','EMAIL','SMS','PUSH','WHATSAPP'];

function time(value?: string) { return value ? new Date(value).toLocaleString() : '—'; }

export default function NotificationsPage() {
  const { activeOrganizationId } = useOrganization();
  const [status, setStatus] = useState<NotificationRecord['status'] | ''>('');
  const query = useNotificationsQuery(activeOrganizationId, status ? { status, limit: 100 } : { limit: 100 });
  const preferences = useNotificationPreferencesQuery(activeOrganizationId);
  const readMutation = useNotificationReadMutation(activeOrganizationId);
  const preferenceMutation = useNotificationPreferenceMutation(activeOrganizationId);
  const notifications = query.data ?? [];
  const unread = notifications.filter((n) => n.status !== 'READ').length;
  const failed = notifications.filter((n) => n.status === 'FAILED').length;
  const queued = notifications.filter((n) => n.status === 'QUEUED').length;
  const prefMap = useMemo(() => new Map((preferences.data ?? []).map((p) => [p.eventType, p])), [preferences.data]);

  return <>
    <PageTitle eyebrow="Communication control" title="Notifications" description="One governed inbox for property events, alerts and operational communication." />
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
      <Stat label="Unread" value={String(unread)} sub="Requires attention" icon={I.Bell}/>
      <Stat label="Queued" value={String(queued)} sub="Awaiting dispatch" icon={I.Activity}/>
      <Stat label="Failed" value={String(failed)} sub="Delivery exceptions" icon={I.AlertTriangle}/>
      <Stat label="Loaded" value={String(notifications.length)} sub="Current inbox window" icon={I.MessageSquare}/>
    </div>
    <div className="grid xl:grid-cols-[1.5fr_1fr] gap-6">
      <section className="card p-5">
        <SectionHeader title="Notification inbox" action={<select value={status} onChange={(e) => setStatus(e.target.value as NotificationRecord['status'] | '')} className="input max-w-[150px]"><option value="">All statuses</option>{['QUEUED','SENT','DELIVERED','READ','FAILED','CANCELLED'].map((x)=><option key={x}>{x}</option>)}</select>} />
        {query.isLoading ? <div className="py-12 text-center text-sm text-muted-foreground">Loading notifications…</div> : query.isError ? <div className="py-12 text-center text-sm text-[#b42318]">Unable to load notifications.</div> : notifications.length === 0 ? <EmptyState icon={I.Bell} title="Inbox is clear" description="No notifications match the current filter."/> : <div className="space-y-2">{notifications.map((n) => <div key={n._id} className={`rounded-xl border p-4 ${n.status === 'READ' ? 'border-border bg-card' : 'border-[#f2d4c5] bg-[#fffaf7]'}`}>
          <div className="flex items-start gap-3"><div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0"><I.Bell size={16}/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-medium text-sm">{n.title}</span><Badge tone={tone[n.status]}>{n.status}</Badge><Badge tone={n.priority === 'URGENT' ? 'red' : n.priority === 'HIGH' ? 'orange' : 'neutral'}>{n.priority}</Badge></div><p className="text-sm text-muted-foreground mt-1">{n.body}</p><div className="text-[11px] text-muted-foreground mt-2">{n.channel} · {n.type} · {time(n.createdAt)}</div></div>{n.status !== 'READ' && <button className="btn-secondary" disabled={readMutation.isPending} onClick={() => readMutation.mutate(n._id)}>Mark read</button>}</div>
        </div>)}</div>}
      </section>
      <section className="card p-5">
        <SectionHeader title="Notification preferences" />
        <p className="text-xs text-muted-foreground mb-4">Preferences are scoped to your active organization and user account.</p>
        {preferences.isLoading ? <div className="text-sm text-muted-foreground">Loading preferences…</div> : (preferences.data ?? []).length === 0 ? <EmptyState icon={I.SlidersHorizontal} title="No preferences configured" description="System defaults remain active until an event preference is created."/> : <div className="space-y-3">{(preferences.data ?? []).map((p) => <div key={p._id ?? p.eventType} className="rounded-xl border border-border p-4"><div className="flex items-center justify-between gap-3"><div><div className="font-medium text-sm">{p.eventType}</div><div className="text-[11px] text-muted-foreground mt-1">{p.channels.join(' · ')}</div></div><button className={p.enabled ? 'btn-primary' : 'btn-secondary'} disabled={preferenceMutation.isPending} onClick={() => preferenceMutation.mutate({ eventType:p.eventType, channels:p.channels, enabled:!p.enabled })}>{p.enabled ? 'Enabled' : 'Disabled'}</button></div><div className="flex flex-wrap gap-1 mt-3">{channels.map((c) => <span key={c} className={`text-[10px] px-2 py-1 rounded-full ${p.channels.includes(c) ? 'bg-[#eff8ff] text-[#175cd3]' : 'bg-muted text-muted-foreground'}`}>{c}</span>)}</div></div>)}</div>}
      </section>
    </div>
  </>;
}
