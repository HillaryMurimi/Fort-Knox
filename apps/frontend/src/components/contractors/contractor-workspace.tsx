'use client';

import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Bell, BriefcaseBusiness, Camera, Check, ChevronRight, CircleDollarSign, Clock3, FileCheck2,
  ImagePlus, MapPin, Play, RefreshCw, Search, Trash2, Upload, Video, Wrench,
} from 'lucide-react';
import { Alert, Badge, Button, Dialog, EmptyState, Input, Label, PageTitle, Skeleton, Stat, TabsList, TabsTrigger, Textarea } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { useOrganization } from '@/hooks/use-organization';
import { useMaintenanceQuery, useQuoteMaintenanceMutation, useProgressMaintenanceMutation, useAddMaintenanceEvidenceMutation } from '@/hooks/queries/use-maintenance-queries';
import { usePropertiesQuery } from '@/hooks/queries/use-property-queries';
import { useBuildingsQuery, useUnitsQuery } from '@/hooks/queries/use-hierarchy-queries';
import { useNotificationsQuery, useNotificationReadMutation } from '@/hooks/queries/use-operations-queries';
import { validateMaintenanceMedia } from '@/components/tenants/maintenance-media';
import type { MaintenanceRequest, NotificationRecord } from '@/lib/data/resource-types';
import { contractorJobActions, filterContractorJobs, type ContractorJobFilter } from './contractor-workspace-model';

type JobAction = 'quote' | 'complete' | 'evidence' | null;

export function ContractorWorkspace() {
  const { user } = useAuth();
  const { activeOrganizationId: org, activeOrganization } = useOrganization();
  const maintenance = useMaintenanceQuery(org);
  const properties = usePropertiesQuery(org);
  const buildings = useBuildingsQuery(org);
  const units = useUnitsQuery(org);
  const notifications = useNotificationsQuery(org, { limit: 30 });
  const progress = useProgressMaintenanceMutation(org);
  const [filter, setFilter] = useState<ContractorJobFilter>('ACTIVE');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [action, setAction] = useState<JobAction>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const jobs = maintenance.data ?? [];
  const visibleJobs = useMemo(() => filterContractorJobs(jobs, filter, search), [jobs, filter, search]);
  const selected = jobs.find((job) => job._id === selectedId) ?? null;
  const unread = (notifications.data ?? []).filter((item) => item.status !== 'READ').length;
  const propertyNames = useMemo(() => new Map((properties.data ?? []).map((item) => [item._id, item.name])), [properties.data]);
  const buildingNames = useMemo(() => new Map((buildings.data ?? []).map((item) => [item._id, item.name])), [buildings.data]);
  const unitNames = useMemo(() => new Map((units.data ?? []).map((item) => [item._id, item.name])), [units.data]);
  const activeCount = jobs.filter((job) => !['COMPLETED', 'VERIFIED', 'CLOSED', 'CANCELLED'].includes(job.status)).length;
  const quoteCount = jobs.filter((job) => ['ASSIGNED', 'QUOTED'].includes(job.status)).length;
  const readyCount = jobs.filter((job) => job.status === 'APPROVED').length;
  const inProgressCount = jobs.filter((job) => job.status === 'IN_PROGRESS').length;

  function location(job: MaintenanceRequest) {
    return [propertyNames.get(job.propertyId), buildingNames.get(job.buildingId), unitNames.get(job.unitId) ?? `Unit ${shortId(job.unitId)}`].filter(Boolean).join(' / ');
  }

  async function startWork(job: MaintenanceRequest) {
    setSuccess(null);
    try {
      await progress.mutateAsync({ id: job._id, input: { status: 'IN_PROGRESS', evidenceIds: [] } });
      setSuccess(`${job.title} is now in progress.`);
    } catch { /* The mutation error is rendered below. */ }
  }

  if (!org) return <EmptyState icon={BriefcaseBusiness} title="No organization selected" description="Select your assigned organization to load contractor work." />;

  return <div className="space-y-6 pb-10">
    <PageTitle eyebrow="Field operations" title={`Welcome, ${user?.firstName ?? 'Contractor'}`} description={`Assigned work for ${activeOrganization?.name ?? 'your organization'}. Quotes, job updates, and evidence remain tied to each authorized request.`} action={<Button variant="outline" onClick={() => setNotificationsOpen(true)}><Bell size={16} /> Updates {unread > 0 && <Badge tone="red">{unread}</Badge>}</Button>} />

    {success && <Alert tone="success" title="Job updated"><div className="flex flex-wrap items-center justify-between gap-3"><span>{success}</span><Button variant="ghost" size="sm" onClick={() => setSuccess(null)}>Dismiss</Button></div></Alert>}
    {(maintenance.error || progress.error) && <Alert tone="destructive" title="The job could not be updated">{maintenance.error?.message ?? progress.error?.message}</Alert>}

    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Stat label="Active jobs" value={String(activeCount)} sub="Your assigned workload" icon={BriefcaseBusiness} />
      <Stat label="Quotes due" value={String(quoteCount)} sub="Waiting for your estimate" icon={CircleDollarSign} />
      <Stat label="Ready to start" value={String(readyCount)} sub="Approved work" icon={FileCheck2} />
      <Stat label="On site" value={String(inProgressCount)} sub="Work in progress" icon={Wrench} />
    </div>

    <section className="overflow-hidden border-y border-border bg-card sm:rounded-md sm:border">
      <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
        <TabsList className="w-full lg:w-auto">
          {([['ACTIVE', 'Active'], ['QUOTE', 'Needs quote'], ['READY', 'Ready'], ['HISTORY', 'History']] as const).map(([value, text]) => <TabsTrigger key={value} active={filter === value} onClick={() => setFilter(value)}>{text}</TabsTrigger>)}
        </TabsList>
        <div className="relative w-full lg:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Search assigned jobs" aria-label="Search assigned jobs" /></div>
      </div>

      {maintenance.isLoading ? <JobsSkeleton /> : maintenance.isError ? <div className="p-6"><Alert tone="destructive" title="Assigned jobs unavailable"><div className="mt-2"><Button variant="outline" size="sm" onClick={() => void maintenance.refetch()}><RefreshCw size={14} /> Retry</Button></div></Alert></div> : visibleJobs.length ? <div className="divide-y divide-border">{visibleJobs.map((job) => {
        const actions = contractorJobActions(job.status);
        return <article key={job._id} className="grid gap-4 p-4 transition-colors hover:bg-muted/50 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <button className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setSelectedId(job._id)}>
            <div className="flex flex-wrap items-center gap-2"><PriorityBadge value={job.priority} /><StatusBadge value={job.status} /><span className="text-xs text-muted-foreground">#{shortId(job._id)}</span></div>
            <h2 className="mt-2 text-base font-semibold">{job.title}</h2>
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{job.description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><MapPin size={13} />{location(job)}</span><span className="flex items-center gap-1.5"><Clock3 size={13} />Updated {formatDate(job.updatedAt ?? job.createdAt)}</span>{job.approvedAmount != null && <span className="font-semibold text-foreground">Approved {money(job.approvedAmount)}</span>}</div>
          </button>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {actions.canQuote && <Button size="sm" onClick={() => { setSelectedId(job._id); setAction('quote'); }}><CircleDollarSign size={15} /> Submit quote</Button>}
            {actions.canStart && <Button size="sm" loading={progress.isPending && progress.variables?.id === job._id} onClick={() => void startWork(job)}><Play size={15} /> Start work</Button>}
            {actions.canComplete && <Button variant={job.status === 'IN_PROGRESS' ? 'default' : 'outline'} size="sm" onClick={() => { setSelectedId(job._id); setAction('complete'); }}><Check size={15} /> Complete</Button>}
            <Button variant="ghost" size="sm" onClick={() => setSelectedId(job._id)}>Details <ChevronRight size={15} /></Button>
          </div>
        </article>;
      })}</div> : <EmptyState className="m-5" icon={BriefcaseBusiness} title={jobs.length ? 'No matching jobs' : 'No assigned jobs'} description={jobs.length ? 'Change the filter or search to see other assigned work.' : 'New work will appear here only after management assigns it to your contractor profile.'} />}
    </section>

    <JobDetails open={Boolean(selected) && !action} job={selected} location={selected ? location(selected) : ''} onOpenChange={(open) => !open && setSelectedId(null)} onAction={setAction} onStart={(job) => void startWork(job)} startBusy={progress.isPending} />
    <QuoteDialog open={action === 'quote'} job={selected} organizationId={org} onOpenChange={(open) => !open && setAction(null)} onDone={(message) => { setAction(null); setSuccess(message); }} />
    <CompleteDialog open={action === 'complete'} job={selected} organizationId={org} onOpenChange={(open) => !open && setAction(null)} onDone={(message) => { setAction(null); setSuccess(message); }} />
    <EvidenceDialog open={action === 'evidence'} job={selected} organizationId={org} onOpenChange={(open) => !open && setAction(null)} onDone={(message) => { setAction(null); setSuccess(message); }} />
    <NotificationsDialog open={notificationsOpen} onOpenChange={setNotificationsOpen} organizationId={org} notifications={notifications.data ?? []} />
  </div>;
}

function JobDetails({ open, job, location, onOpenChange, onAction, onStart, startBusy }: { open: boolean; job: MaintenanceRequest | null; location: string; onOpenChange: (open: boolean) => void; onAction: (action: JobAction) => void; onStart: (job: MaintenanceRequest) => void; startBusy: boolean }) {
  if (!job) return null;
  const actions = contractorJobActions(job.status);
  return <Dialog open={open} onOpenChange={onOpenChange} title={job.title} description={`Job #${shortId(job._id)}`} className="max-w-2xl">
    <div className="flex flex-wrap gap-2"><PriorityBadge value={job.priority} /><StatusBadge value={job.status} /><Badge>{titleCase(job.category)}</Badge></div>
    <p className="mt-4 text-sm leading-6 text-muted-foreground">{job.description}</p>
    <dl className="mt-5 grid gap-4 border-y border-border py-5 sm:grid-cols-2"><Detail label="Location" value={location} /><Detail label="Assigned" value={formatDate(job.createdAt)} /><Detail label="Quote" value={money(job.quoteAmount)} /><Detail label="Approved budget" value={money(job.approvedAmount)} /><Detail label="Actual cost" value={money(job.actualAmount)} /><Detail label="Evidence" value={`${job.evidenceIds.length} file${job.evidenceIds.length === 1 ? '' : 's'}`} /></dl>
    {job.resolutionNotes && <div className="mt-4 rounded-md border border-border bg-muted p-4"><div className="text-xs font-semibold uppercase text-muted-foreground">Latest job note</div><p className="mt-1 text-sm leading-6">{job.resolutionNotes}</p></div>}
    {job.status === 'APPROVAL_REQUIRED' && <Alert tone="warning" className="mt-4" title="Waiting for approval">Management must approve the quoted amount before work starts.</Alert>}
    {['COMPLETED', 'VERIFIED'].includes(job.status) && <Alert className="mt-4" title="Handoff in progress">The work is with management or the resident for verification. Contractors cannot verify their own completion.</Alert>}
    <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end"><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>{actions.canAddEvidence && <Button variant="outline" onClick={() => onAction('evidence')}><Upload size={15} /> Add proof</Button>}{actions.canQuote && <Button onClick={() => onAction('quote')}><CircleDollarSign size={15} /> Submit quote</Button>}{actions.canStart && <Button loading={startBusy} onClick={() => onStart(job)}><Play size={15} /> Start work</Button>}{actions.canComplete && <Button onClick={() => onAction('complete')}><Check size={15} /> Complete job</Button>}</div>
  </Dialog>;
}

function QuoteDialog({ open, job, organizationId, onOpenChange, onDone }: ActionDialogProps) {
  const quote = useQuoteMaintenanceMutation(organizationId);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!job) return; const form = event.currentTarget; const data = new FormData(form); try { await quote.mutateAsync({ id: job._id, input: { quoteAmount: Number(data.get('amount')), notes: String(data.get('notes') ?? ''), evidenceIds: [] } }); form.reset(); onDone(`Quote submitted for ${job.title}.`); } catch { /* Rendered below. */ } }
  return <Dialog open={open} onOpenChange={onOpenChange} title="Submit job quote" description={job ? `${job.title} / #${shortId(job._id)}` : ''} className="max-w-lg"><form onSubmit={(event) => void submit(event)} className="space-y-4"><div><Label htmlFor="quote-amount">Total quote (KES)</Label><Input id="quote-amount" name="amount" type="number" min="0" step="1" required placeholder="0" /></div><div><Label htmlFor="quote-notes">Scope and materials</Label><Textarea id="quote-notes" name="notes" maxLength={5000} required minLength={5} placeholder="Describe labour, parts, and what the quote covers." /></div><Alert title="Approval control">Submitting a quote does not authorize work. The job will show when management approves it.</Alert>{quote.error && <Alert tone="destructive">{quote.error.message}</Alert>}<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" loading={quote.isPending}><CircleDollarSign size={15} /> Submit quote</Button></div></form></Dialog>;
}

function CompleteDialog({ open, job, organizationId, onOpenChange, onDone }: ActionDialogProps) {
  const progress = useProgressMaintenanceMutation(organizationId); const upload = useAddMaintenanceEvidenceMutation(organizationId); const [files, setFiles] = useState<File[]>([]); const [mediaError, setMediaError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!job) return; const data = new FormData(event.currentTarget); setMediaError(null); try { const evidence = files.length ? await upload.mutateAsync({ id: job._id, files }) : []; await progress.mutateAsync({ id: job._id, input: { status: 'COMPLETED', actualAmount: Number(data.get('amount')), resolutionNotes: String(data.get('notes')), evidenceIds: evidence.map((item) => item._id) } }); setFiles([]); onDone(`${job.title} was submitted for verification.`); } catch { /* Rendered below. */ } }
  const busy = progress.isPending || upload.isPending;
  return <Dialog open={open} onOpenChange={(value) => { if (!value && !busy) { setFiles([]); setMediaError(null); } onOpenChange(value); }} title="Complete job" description="Record the final cost and leave clear verification evidence." className="max-w-2xl"><form onSubmit={(event) => void submit(event)} className="space-y-4"><div><Label htmlFor="actual-amount">Final cost (KES)</Label><Input id="actual-amount" name="amount" type="number" min="0" max={job?.approvedAmount} step="1" required defaultValue={job?.approvedAmount ?? job?.quoteAmount ?? ''} /><p className="mt-1 text-xs text-muted-foreground">Approved ceiling: {money(job?.approvedAmount)}</p></div><div><Label htmlFor="completion-notes">Work completed</Label><Textarea id="completion-notes" name="notes" required minLength={8} maxLength={10000} placeholder="Describe the repair, parts fitted, tests performed, and any follow-up needed." /></div><MediaPicker files={files} onFiles={setFiles} error={mediaError} onError={setMediaError} /><Alert title="Independent verification">Completion hands the job back for verification. It does not let the contractor self-approve the work.</Alert>{(progress.error || upload.error) && <Alert tone="destructive">{progress.error?.message ?? upload.error?.message}</Alert>}<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" loading={busy}><Check size={15} /> Submit completion</Button></div></form></Dialog>;
}

function EvidenceDialog({ open, job, organizationId, onOpenChange, onDone }: ActionDialogProps) {
  const upload = useAddMaintenanceEvidenceMutation(organizationId); const [files, setFiles] = useState<File[]>([]); const [mediaError, setMediaError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!job || !files.length) return; try { await upload.mutateAsync({ id: job._id, files }); setFiles([]); onDone(`${files.length} evidence file${files.length === 1 ? '' : 's'} added to ${job.title}.`); } catch { /* Rendered below. */ } }
  return <Dialog open={open} onOpenChange={(value) => { if (!value && !upload.isPending) { setFiles([]); setMediaError(null); } onOpenChange(value); }} title="Add job proof" description="Capture before, during, or after-work photos and videos." className="max-w-2xl"><form onSubmit={(event) => void submit(event)} className="space-y-4"><MediaPicker files={files} onFiles={setFiles} error={mediaError} onError={setMediaError} />{upload.error && <Alert tone="destructive">{upload.error.message}</Alert>}<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" disabled={upload.isPending} onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" loading={upload.isPending} disabled={!files.length}><Upload size={15} /> Upload proof</Button></div></form></Dialog>;
}

function MediaPicker({ files, onFiles, error, onError }: { files: File[]; onFiles: (files: File[]) => void; error: string | null; onError: (error: string | null) => void }) {
  const photo = useRef<HTMLInputElement>(null); const video = useRef<HTMLInputElement>(null); const gallery = useRef<HTMLInputElement>(null);
  function add(event: ChangeEvent<HTMLInputElement>) { const added = Array.from(event.target.files ?? []); event.target.value = ''; const validation = validateMaintenanceMedia(added, files.length); if (validation) { onError(validation); return; } onError(null); onFiles([...files, ...added]); }
  return <fieldset><legend className="field-label">Photo or video proof <span className="font-normal text-muted-foreground">(up to 5)</span></legend><input ref={photo} type="file" accept="image/*" capture="environment" className="sr-only" onChange={add} /><input ref={video} type="file" accept="video/*" capture="environment" className="sr-only" onChange={add} /><input ref={gallery} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/webm,video/quicktime" multiple className="sr-only" onChange={add} /><div className="grid grid-cols-3 gap-2"><MediaButton icon={Camera} label="Take photo" onClick={() => photo.current?.click()} disabled={files.length >= 5} /><MediaButton icon={Video} label="Record video" onClick={() => video.current?.click()} disabled={files.length >= 5} /><MediaButton icon={ImagePlus} label="Choose files" onClick={() => gallery.current?.click()} disabled={files.length >= 5} /></div>{files.length > 0 && <div className="mt-3 divide-y divide-border rounded-md border border-border">{files.map((file, index) => <div key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center gap-3 p-3"><FileCheck2 className="shrink-0 text-muted-foreground" size={16} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{file.name}</div><div className="text-xs text-muted-foreground">{formatBytes(file.size)}</div></div><Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Remove ${file.name}`} onClick={() => onFiles(files.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14} /></Button></div>)}</div>}{error && <Alert tone="destructive" className="mt-3">{error}</Alert>}<p className="mt-2 text-xs text-muted-foreground">Photos up to 10 MB. Videos up to 25 MB. Avoid capturing unrelated resident information.</p></fieldset>;
}

function MediaButton({ icon: Icon, label, onClick, disabled }: { icon: typeof Camera; label: string; onClick: () => void; disabled: boolean }) { return <Button type="button" variant="outline" className="h-auto min-h-20 flex-col px-2 py-3" onClick={onClick} disabled={disabled}><Icon size={18} /><span className="text-xs">{label}</span></Button>; }

function NotificationsDialog({ open, onOpenChange, organizationId, notifications }: { open: boolean; onOpenChange: (open: boolean) => void; organizationId: string; notifications: NotificationRecord[] }) {
  const markRead = useNotificationReadMutation(organizationId); const unread = notifications.filter((item) => item.status !== 'READ');
  async function markAll() { for (const item of unread) await markRead.mutateAsync(item._id); }
  return <Dialog open={open} onOpenChange={onOpenChange} title="Work updates" description={`${unread.length} unread notification${unread.length === 1 ? '' : 's'}.`} className="max-w-2xl"><div className="mb-4 flex justify-end"><Button variant="outline" size="sm" disabled={!unread.length} loading={markRead.isPending} onClick={() => void markAll()}><Check size={14} /> Mark all read</Button></div>{markRead.error && <Alert tone="destructive" className="mb-3">{markRead.error.message}</Alert>}<div className="max-h-[56vh] divide-y divide-border overflow-y-auto border-y border-border">{notifications.length ? notifications.map((item) => <div key={item._id} className="flex gap-3 py-4"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${item.status !== 'READ' ? 'bg-[#eff8ff] text-[#175cd3]' : 'bg-muted text-muted-foreground'}`}><Bell size={16} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{item.title}</h3>{item.priority === 'URGENT' && <Badge tone="red">Urgent</Badge>}</div><p className="mt-1 text-sm leading-6 text-muted-foreground">{item.body}</p><div className="mt-1 text-xs text-muted-foreground">{formatDate(item.createdAt ?? item.sentAt)}</div></div>{item.status !== 'READ' && <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Mark ${item.title} read`} onClick={() => markRead.mutate(item._id)}><Check size={14} /></Button>}</div>) : <div className="py-10 text-center text-sm text-muted-foreground">No work updates yet.</div>}</div><div className="mt-5 flex justify-end"><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button></div></Dialog>;
}

interface ActionDialogProps { open: boolean; job: MaintenanceRequest | null; organizationId: string; onOpenChange: (open: boolean) => void; onDone: (message: string) => void }
function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm font-semibold">{value}</dd></div>; }
function StatusBadge({ value }: { value: MaintenanceRequest['status'] }) { const tone = ['COMPLETED', 'VERIFIED', 'CLOSED'].includes(value) ? 'green' : ['APPROVAL_REQUIRED', 'ASSIGNED', 'QUOTED'].includes(value) ? 'orange' : ['APPROVED', 'IN_PROGRESS'].includes(value) ? 'blue' : value === 'CANCELLED' ? 'red' : 'neutral'; return <Badge tone={tone}>{titleCase(value)}</Badge>; }
function PriorityBadge({ value }: { value: MaintenanceRequest['priority'] }) { return <Badge tone={value === 'EMERGENCY' ? 'red' : value === 'HIGH' ? 'orange' : value === 'LOW' ? 'green' : 'neutral'}>{titleCase(value)}</Badge>; }
function JobsSkeleton() { return <div className="space-y-0 divide-y divide-border">{Array.from({ length: 3 }, (_, index) => <div key={index} className="p-5"><div className="flex gap-2"><Skeleton className="h-5 w-16" /><Skeleton className="h-5 w-24" /></div><Skeleton className="mt-3 h-4 w-2/5" /><Skeleton className="mt-2 h-3 w-4/5" /></div>)}</div>; }
function titleCase(value: string) { return value.toLowerCase().replaceAll('_', ' ').replace(/(^|\s)\S/g, (character) => character.toUpperCase()); }
function shortId(value: string) { return value.length > 8 ? value.slice(-8).toUpperCase() : value.toUpperCase(); }
function money(value?: number) { return value == null ? 'Not recorded' : new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(value); }
function formatDate(value?: string) { if (!value) return 'Not recorded'; const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Not recorded' : new Intl.DateTimeFormat('en-KE', { day: '2-digit', month: 'short', year: 'numeric' }).format(date); }
function formatBytes(value: number) { return value < 1_000_000 ? `${Math.max(1, Math.round(value / 1000))} KB` : `${(value / 1_000_000).toFixed(1)} MB`; }
