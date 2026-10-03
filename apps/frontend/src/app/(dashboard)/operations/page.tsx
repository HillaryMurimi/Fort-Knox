'use client';
import { useMemo } from 'react';
import * as I from '@/components/icons';
import { StatusBadge, EmptyState, PageTitle, SectionHeader, Stat } from '@/components/ui';
import { useOrganization } from '@/hooks/use-organization';
import { useJobsQuery, useNotificationsQuery, useEnqueueJobMutation } from '@/hooks/queries/use-operations-queries';





export default function Operations() {
  const { activeOrganizationId } = useOrganization();
  const jobs = useJobsQuery(activeOrganizationId, { page:1, pageSize:50 });
  const notifications = useNotificationsQuery(activeOrganizationId, { limit:100 });
  const enqueue = useEnqueueJobMutation(activeOrganizationId);
  const jobData = jobs.data?.data ?? [];
  const notificationData = notifications.data ?? [];
  const queued = jobData.filter((j) => j.status === 'QUEUED').length;
  const failed = jobData.filter((j) => j.status === 'FAILED' || j.status === 'DEAD_LETTER').length;
  const delivered = notificationData.filter((n) => n.status === 'DELIVERED' || n.status === 'READ').length;
  const deliveryRate = notificationData.length ? `${Math.round(delivered / notificationData.length * 100)}%` : '—';
  const recentJobs = useMemo(() => jobData.slice(0, 8), [jobData]);

  function queueEvaluation() { if (!activeOrganizationId) return; enqueue.mutate({ type:'intelligence.evaluate', payload:{ organizationId:activeOrganizationId, trigger:'MANUAL' }, priority:5, maxAttempts:5, dedupeKey:`intelligence.evaluate:${activeOrganizationId}:${new Date().toISOString().slice(0,13)}` }); }

  return <>
    <PageTitle eyebrow="Control plane" title="Operations" description="Durable jobs, governed notifications and system execution state." action={<button className="btn-primary" onClick={queueEvaluation} disabled={!activeOrganizationId || enqueue.isPending}><I.RefreshCw size={15}/>{enqueue.isPending ? 'Queueing…' : 'Evaluate intelligence'}</button>} />
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3"><Stat label="Jobs queued" value={String(queued)} sub={`${failed} failed / dead-lettered`} icon={I.Activity}/><Stat label="Notifications" value={String(notificationData.length)} sub={`${deliveryRate} delivered/read`} icon={I.Bell}/><Stat label="Audit" value="Live" sub="Append-only ledger" icon={I.ClipboardCheck}/><Stat label="Execution" value={failed ? 'Attention' : 'Healthy'} sub="Current control-plane window" trend={failed ? 'down' : 'up'} icon={I.CloudCog}/></div>
    <div className="grid xl:grid-cols-[1.35fr_1fr] gap-6 mt-6">
      <div className="card p-5"><SectionHeader title="Durable job queue"/><div className="space-y-2">{jobs.isLoading ? <div className="py-8 text-center text-sm text-muted-foreground">Loading jobs…</div> : recentJobs.length === 0 ? <EmptyState icon={I.Activity} title="No jobs in this window" description="The durable queue has no matching execution records."/> : recentJobs.map((job)=><div key={job._id} className="rounded-xl border border-border p-3 flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center"><I.Activity size={14}/></div><div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{job.type}</div><div className="text-[11px] text-muted-foreground">Attempt {job.attempts}/{job.maxAttempts} · {new Date(job.availableAt).toLocaleString()}</div></div><StatusBadge status={job.status} domain="job">{job.status}</StatusBadge></div>)}</div></div>
      <div className="card p-5"><SectionHeader title="Recent notifications" action={<a href="/notifications" className="text-xs text-[#d97745] font-medium">Open inbox</a>}/>{notificationData.length === 0 ? <EmptyState icon={I.Bell} title="No notifications" description="Notification activity will appear here as the platform emits events."/> : <div className="space-y-3">{notificationData.slice(0,7).map((n)=><div key={n._id} className="flex gap-3"><div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center"><I.Bell size={14}/></div><div className="min-w-0 flex-1"><div className="text-sm truncate">{n.title}</div><div className="text-[11px] text-muted-foreground truncate">{n.channel} · {n.type}</div></div><StatusBadge status={n.status} domain="notification">{n.status}</StatusBadge></div>)}</div>}</div>
    </div>
  </>;
}
