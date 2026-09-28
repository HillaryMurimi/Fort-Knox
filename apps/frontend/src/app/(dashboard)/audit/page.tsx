'use client';

import { useState } from 'react';
import { ClipboardCheck, FileText, History, Search } from 'lucide-react';
import { useOrganization } from '@/hooks/use-organization';
import { useAuditLogsQuery, useDomainEventsQuery } from '@/hooks/queries/use-audit-queries';
import { Badge, EmptyState, PageTitle } from '@/components/ui';

export default function AuditPage() {
  const { activeOrganizationId: organizationId } = useOrganization();
  const [tab, setTab] = useState<'logs' | 'events'>('logs');
  const [search, setSearch] = useState('');
  const logs = useAuditLogsQuery(organizationId, { limit: 200 });
  const events = useDomainEventsQuery(organizationId, { limit: 200 });
  if (!organizationId) return <EmptyState icon={History} title="Select an organization" description="Choose an organization to inspect its immutable audit ledger." />;

  const query = search.toLowerCase();
  const filteredLogs = (logs.data ?? []).filter((item) => `${item.action} ${item.resourceType} ${item.resourceId ?? ''} ${item.actorUserId ?? ''}`.toLowerCase().includes(query));
  const filteredEvents = (events.data ?? []).filter((item) => `${item.name} ${item.aggregateType} ${item.aggregateId} ${item.correlationId ?? ''} ${item.requestId ?? ''}`.toLowerCase().includes(query));

  return <div>
    <PageTitle eyebrow="Governance" title="Audit Ledger" description="Append-only audit history and domain events. The frontend can inspect them; it cannot mutate or delete them." />
    <div className="mb-5 flex flex-wrap gap-3">
      <div className="relative min-w-48 flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input className="input pl-9" aria-label="Search audit ledger" placeholder="Search action, resource, actor or event" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      <div className="flex rounded-lg bg-muted p-1" role="tablist" aria-label="Audit ledger views">
        <button role="tab" aria-selected={tab === 'logs'} className={`rounded-md px-3 py-2 text-xs ${tab === 'logs' ? 'bg-card shadow-sm' : ''}`} onClick={() => setTab('logs')}>Audit logs</button>
        <button role="tab" aria-selected={tab === 'events'} className={`rounded-md px-3 py-2 text-xs ${tab === 'events' ? 'bg-card shadow-sm' : ''}`} onClick={() => setTab('events')}>Domain events</button>
      </div>
    </div>
    {tab === 'logs' ? <section className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border p-5 font-semibold"><History size={17} /> Audit entries <Badge tone="orange">Append-only</Badge></div>
      {logs.isLoading ? <div className="p-8 text-sm text-muted-foreground">Loading audit ledger...</div> : logs.isError ? <div className="p-8 text-sm text-destructive">Audit entries could not be loaded.</div> : filteredLogs.length ? <div className="divide-y divide-border">{filteredLogs.map((item) => <div key={item._id} className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{item.action}</span><Badge tone="neutral">{item.resourceType}</Badge>{item.resourceId && <span className="break-all text-[11px] text-muted-foreground">{item.resourceId}</span>}</div>
        <div className="mt-1 text-xs text-muted-foreground">{new Date(item.occurredAt).toLocaleString()} · actor {item.actorUserId ?? 'system'}{item.requestId ? ` · request ${item.requestId}` : ''}</div>
      </div>)}</div> : <EmptyState icon={FileText} title="No audit entries" description="Material changes will appear here after backend writes to the audit ledger." />}
    </section> : <section className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border p-5 font-semibold"><ClipboardCheck size={17} /> Domain events <Badge tone="blue">System ledger</Badge></div>
      {events.isLoading ? <div className="p-8 text-sm text-muted-foreground">Loading domain events...</div> : events.isError ? <div className="p-8 text-sm text-destructive">Domain events could not be loaded.</div> : filteredEvents.length ? <div className="divide-y divide-border">{filteredEvents.map((item) => <div key={item.eventId} className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{item.name}</span><Badge tone="neutral">{item.aggregateType}</Badge><span className="text-[11px] text-muted-foreground">#{item.version} · schema {item.schemaVersion ?? 1}</span><Badge tone="blue">{item.source ?? 'APPLICATION'}</Badge></div>
        <div className="mt-1 break-all text-xs text-muted-foreground">{new Date(item.occurredAt).toLocaleString()} · {item.aggregateId}{item.actorRole ? ` · ${item.actorRole}` : ''}{item.correlationId ? ` · correlation ${item.correlationId}` : ''}{item.requestId ? ` · request ${item.requestId}` : ''}</div>
      </div>)}</div> : <EmptyState icon={ClipboardCheck} title="No domain events" description="Published events will feed downstream notifications, jobs and intelligence." />}
    </section>}
  </div>;
}
