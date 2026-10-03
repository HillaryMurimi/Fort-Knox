'use client';

import { CameraSetupForm } from '@/components/integrations/setup-forms';
import { StatusSelect,  StatusBadge,  Dialog } from '@/components/ui';
import { useMemo, useState } from 'react';
import * as I from '@/components/icons';
import { Badge, EmptyState, PageTitle, SectionHeader, Stat } from '@/components/ui';
import { useOrganization } from '@/hooks/use-organization';
import {
  useAccessEventsQuery, useAccessPointsQuery, useCamerasQuery, useCreateAccessPointMutation,
  useCreateIncidentMutation, useCreateSecurityEventMutation,
  useIncidentsQuery, useSecurityEventsQuery, useSecuritySummaryQuery, useUpdateCameraMutation,
  useUpdateIncidentMutation, useUpdateSecurityEventMutation,
} from '@/hooks/queries/use-security-queries';
import { useEvidenceQuery } from '@/hooks/queries/use-document-queries';
import type { AccessPoint, Incident, SecurityCamera, SecurityEvent } from '@/lib/data/resource-types';
import type { CreateAccessPointInput, CreateIncidentInput, CreateSecurityEventInput } from '@/lib/data/security';


const label = (value: string) => value.replaceAll('_', ' ');
const time = (value?: string) => value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export default function Security() {
  const { activeOrganizationId: org } = useOrganization();
  const [tab, setTab] = useState<'overview'|'cameras'|'events'|'incidents'|'access'|'evidence'>('overview');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<'camera'|'event'|'incident'|'access-point'|null>(null);
  const [selectedCamera, setSelectedCamera] = useState<SecurityCamera | null>(null);

  const cameras = useCamerasQuery(org);
  const summary = useSecuritySummaryQuery(org);
  const events = useSecurityEventsQuery(org, { limit: 50 });
  const incidents = useIncidentsQuery(org, { limit: 50 });
  const accessPoints = useAccessPointsQuery(org);
  const accessEvents = useAccessEventsQuery(org, { limit: 50 });
  const evidence = useEvidenceQuery(org, { relatedResourceType: 'SECURITY_EVENT' });

  const createEvent = useCreateSecurityEventMutation(org);
  const createIncident = useCreateIncidentMutation(org);
  const createAccessPoint = useCreateAccessPointMutation(org);
  const updateCamera = useUpdateCameraMutation(org);
  const updateEvent = useUpdateSecurityEventMutation(org);
  const updateIncident = useUpdateIncidentMutation(org);

  const filteredEvents = useMemo(() => (events.data ?? []).filter((x) => `${x.type} ${x.severity} ${x.status} ${x.description ?? ''}`.toLowerCase().includes(query.toLowerCase())), [events.data, query]);
  const filteredIncidents = useMemo(() => (incidents.data ?? []).filter((x) => `${x.incidentNumber} ${x.title} ${x.category} ${x.status}`.toLowerCase().includes(query.toLowerCase())), [incidents.data, query]);
  const online = (cameras.data ?? []).filter((x) => x.status === 'ONLINE').length;
  const offline = summary.data?.offlineCameras ?? (cameras.data ?? []).filter((x) => x.status === 'OFFLINE').length;
  const openIncidents = (incidents.data ?? []).filter((x) => !['RESOLVED','CLOSED','FALSE_ALARM'].includes(x.status)).length;
  const critical = summary.data?.criticalOpenEvents ?? (events.data ?? []).filter((x) => x.status === 'OPEN' && x.severity === 'CRITICAL').length;
  const denials = summary.data?.deniedAccessEvents24h ?? (accessEvents.data ?? []).filter((x) => x.decision === 'DENIED').length;

  function openAction() {
    setModal(tab === 'cameras' ? 'camera' : tab === 'events' ? 'event' : tab === 'incidents' ? 'incident' : tab === 'access' ? 'access-point' : 'camera');
  }

  return <div>
    <PageTitle eyebrow="Security command" title="Security & CCTV Operations" description="Connect cameras, physical access, incidents and evidence into one auditable security posture." action={<button className="btn-primary" onClick={openAction}><I.Plus size={15}/>{tab === 'cameras' ? 'Add camera' : tab === 'incidents' ? 'Report incident' : tab === 'access' ? 'Add access point' : tab === 'events' ? 'Record event' : 'Connect CCTV'}</button>} />

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <Stat label="Cameras online" value={`${online} / ${(cameras.data ?? []).length}`} sub={offline ? `${offline} offline or unavailable` : 'All registered cameras online'} icon={I.Camera}/>
      <Stat label="Open incidents" value={String(openIncidents)} sub={critical ? `${critical} critical event${critical === 1 ? '' : 's'}` : 'No critical open events'} icon={I.ShieldAlert}/>
      <Stat label="Open security events" value={String(summary.data?.totalOpenEvents ?? (events.data ?? []).filter((x) => x.status === 'OPEN').length)} sub="CCTV, access control and sensor signals" icon={I.AlertTriangle}/>
      <Stat label="Access denials" value={String(denials)} sub="Last 24 hours" icon={I.DoorOpen}/>
    </div>

    <div className="flex flex-wrap gap-2 mb-5">
      {(['overview','cameras','events','incidents','access','evidence'] as const).map((x) => <button key={x} onClick={() => setTab(x)} className={`px-4 py-2 rounded-xl text-sm font-medium ${tab === x ? 'bg-[#101828] text-white' : 'bg-card border border-border text-muted-foreground'}`}>{label(x)}</button>)}
    </div>

    {(tab === 'overview' || tab === 'cameras') && <CameraPanel data={cameras.data ?? []} loading={cameras.isLoading} onView={setSelectedCamera} onToggle={(camera) => updateCamera.mutate({ id: camera._id, input: { status: camera.status === 'ONLINE' ? 'DISABLED' : 'ONLINE' } })} />}

    {tab === 'overview' && <div className="grid lg:grid-cols-2 gap-6 mt-6"><EventPanel data={filteredEvents.slice(0, 8)} loading={events.isLoading} onUpdate={(id, status) => updateEvent.mutate({ id, input: { status } })}/><IncidentPanel data={filteredIncidents.slice(0, 6)} loading={incidents.isLoading} onUpdate={(id, status) => updateIncident.mutate({ id, input: { status } })}/></div>}

    {tab === 'events' && <div className="card overflow-hidden"><div className="p-4 border-b border-border"><Search value={query} onChange={setQuery} placeholder="Search security events..."/></div><EventPanel data={filteredEvents} loading={events.isLoading} onUpdate={(id, status) => updateEvent.mutate({ id, input: { status } })}/></div>}
    {tab === 'incidents' && <div className="card overflow-hidden"><div className="p-4 border-b border-border"><Search value={query} onChange={setQuery} placeholder="Search incidents..."/></div><IncidentPanel data={filteredIncidents} loading={incidents.isLoading} onUpdate={(id, status) => updateIncident.mutate({ id, input: { status } })}/></div>}
    {tab === 'access' && <AccessPanel points={accessPoints.data ?? []} events={accessEvents.data ?? []} loading={accessPoints.isLoading || accessEvents.isLoading}/>} 
    {tab === 'evidence' && <EvidencePanel data={evidence.data ?? []} loading={evidence.isLoading}/>} 

    {selectedCamera && <CameraModal camera={selectedCamera} onClose={() => setSelectedCamera(null)}/>} 
    {modal === 'camera' && org && <Dialog open onOpenChange={() => setModal(null)} title="Connect CCTV"><CameraSetupForm key={org} organizationId={org} onDone={() => setModal(null)}/></Dialog>} 
    {modal === 'event' && <EventForm busy={createEvent.isPending} onClose={() => setModal(null)} onSubmit={(v) => createEvent.mutate(v, { onSuccess: () => setModal(null) })}/>} 
    {modal === 'incident' && <IncidentForm busy={createIncident.isPending} onClose={() => setModal(null)} onSubmit={(v) => createIncident.mutate(v, { onSuccess: () => setModal(null) })}/>} 
    {modal === 'access-point' && <AccessPointForm busy={createAccessPoint.isPending} onClose={() => setModal(null)} onSubmit={(v) => createAccessPoint.mutate(v, { onSuccess: () => setModal(null) })}/>} 
  </div>;
}

function Search({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) { return <div className="h-10 max-w-md bg-muted rounded-xl flex items-center px-3 gap-2"><I.Search size={16}/><input value={value} onChange={(e) => onChange(e.target.value)} className="outline-none bg-transparent w-full text-sm" placeholder={placeholder}/></div>; }

function CameraPanel({ data, loading, onView, onToggle }: { data: SecurityCamera[]; loading: boolean; onView: (x: SecurityCamera) => void; onToggle: (x: SecurityCamera) => void }) { return <section className="card p-5"><SectionHeader title="Camera grid" action={<StatusBadge status="ONLINE" domain="integration">{data.filter((x) => x.status === 'ONLINE').length} online</StatusBadge>}/>{loading ? <div className="p-8 text-sm text-muted-foreground">Loading camera registry…</div> : data.length ? <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">{data.map((x) => <div key={x._id} className="rounded-xl border border-border overflow-hidden"><div className="aspect-video bg-[#182230] flex items-center justify-center text-white/30"><I.Camera size={34}/></div><div className="p-3"><div className="flex justify-between gap-3"><div><div className="font-medium text-sm">{x.name}</div><div className="text-[11px] text-muted-foreground mt-1">{x.cameraCode} · {x.connectionType}</div></div><StatusBadge status={x.status} domain="integration">{label(x.status)}</StatusBadge></div><div className="flex gap-2 mt-3"><button className="btn-secondary" onClick={() => onView(x)}>Live / playback</button><button className="btn-secondary" onClick={() => onToggle(x)}>{x.status === 'ONLINE' ? 'Disable' : 'Enable'}</button></div></div></div>)}</div> : <EmptyState icon={I.Camera} title="No cameras registered" description="Register a camera to establish the property's CCTV command layer."/>}</section>; }

function EventPanel({ data, loading, onUpdate }: { data: SecurityEvent[]; loading: boolean; onUpdate: (id: string, status: 'ACKNOWLEDGED'|'ESCALATED'|'RESOLVED'|'DISMISSED') => void }) { return <section className="card overflow-hidden"><SectionHeader title="Security events"/><div className="divide-y divide-border">{loading ? <div className="p-8 text-sm text-muted-foreground">Loading security events…</div> : data.length ? data.map((x) => <div key={x._id} className="px-5 py-4 flex flex-wrap items-center gap-3"><div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center"><I.ShieldAlert size={16}/></div><div className="flex-1 min-w-[210px]"><div className="font-medium text-sm">{label(x.type)}</div><div className="text-xs text-muted-foreground mt-1">{time(x.detectedAt)} · {label(x.source)}{x.description ? ` · ${x.description}` : ''}</div></div><StatusBadge status={x.severity} domain="predictive">{label(x.severity)}</StatusBadge><StatusBadge status={x.status} domain="alert">{label(x.status)}</StatusBadge>{x.status === 'OPEN' && <button className="btn-secondary" onClick={() => onUpdate(x._id, 'ACKNOWLEDGED')}>Acknowledge</button>}{x.status === 'ACKNOWLEDGED' && <button className="btn-secondary" onClick={() => onUpdate(x._id, 'RESOLVED')}>Resolve</button>}</div>) : <div className="p-8"><EmptyState icon={I.Shield} title="No security events" description="CCTV and access-control signals will appear here as they arrive."/></div>}</div></section>; }

function IncidentPanel({ data, loading, onUpdate }: { data: Incident[]; loading: boolean; onUpdate: (id: string, status: 'INVESTIGATING'|'CONTAINED'|'RESOLVED'|'CLOSED'|'FALSE_ALARM') => void }) { return <section className="card overflow-hidden"><SectionHeader title="Incidents"/><div className="divide-y divide-border">{loading ? <div className="p-8 text-sm text-muted-foreground">Loading incidents…</div> : data.length ? data.map((x) => <div key={x._id} className="px-5 py-4 flex flex-wrap items-center gap-3"><div className="flex-1 min-w-[220px]"><div className="font-medium text-sm">{x.title}</div><div className="text-xs text-muted-foreground mt-1">{x.incidentNumber} · {label(x.category)} · {time(x.reportedAt)}</div></div><StatusBadge status={x.severity} domain="predictive">{label(x.severity)}</StatusBadge><StatusBadge status={x.status} domain="incident">{label(x.status)}</StatusBadge>{x.status === 'OPEN' && <button className="btn-secondary" onClick={() => onUpdate(x._id, 'INVESTIGATING')}>Investigate</button>}{x.status === 'INVESTIGATING' && <button className="btn-secondary" onClick={() => onUpdate(x._id, 'CONTAINED')}>Contain</button>}{x.status === 'CONTAINED' && <button className="btn-secondary" onClick={() => onUpdate(x._id, 'RESOLVED')}>Resolve</button>}</div>) : <div className="p-8"><EmptyState icon={I.ShieldAlert} title="No incidents" description="Reported security incidents will remain linked to their source events and evidence."/></div>}</div></section>; }

function AccessPanel({ points, events, loading }: { points: AccessPoint[]; events: import('@/lib/data/resource-types').AccessEvent[]; loading: boolean }) { return <div className="grid lg:grid-cols-2 gap-6"><section className="card overflow-hidden"><SectionHeader title="Access points"/><div className="divide-y divide-border">{loading ? <div className="p-8 text-sm text-muted-foreground">Loading access control…</div> : points.length ? points.map((x) => <div key={x._id} className="px-5 py-4 flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center"><I.DoorOpen size={16}/></div><div className="flex-1"><div className="font-medium text-sm">{x.name}</div><div className="text-xs text-muted-foreground">{x.pointCode} · {label(x.type)}</div></div><StatusBadge status={x.status} domain="integration">{label(x.status)}</StatusBadge></div>) : <div className="p-8"><EmptyState icon={I.DoorOpen} title="No access points" description="Register gates, doors, lifts and parking controls to unify access visibility."/></div>}</div></section><section className="card overflow-hidden"><SectionHeader title="Recent access events"/><div className="divide-y divide-border">{events.length ? events.slice(0, 12).map((x) => <div key={x._id} className="px-5 py-4 flex items-center gap-3"><div className="flex-1"><div className="font-medium text-sm">{label(x.eventType)}</div><div className="text-xs text-muted-foreground">{time(x.occurredAt)} · {label(x.credentialType)}</div></div><StatusBadge status={x.decision} domain="general">{x.decision}</StatusBadge></div>) : <div className="p-8 text-sm text-muted-foreground">No access events recorded.</div>}</div></section></div>; }

function EvidencePanel({ data, loading }: { data: import('@/lib/data/resource-types').EvidenceRecord[]; loading: boolean }) { return <section className="card overflow-hidden"><SectionHeader title="Security evidence chain" action={<Badge tone="blue">CCTV-linked evidence</Badge>}/>{loading ? <div className="p-8 text-sm text-muted-foreground">Loading evidence…</div> : data.length ? <div className="divide-y divide-border">{data.map((x) => <div key={x._id} className="px-5 py-4 flex flex-wrap items-center gap-3"><div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">{x.evidenceType === 'VIDEO' ? <I.Camera size={16}/> : <I.FileText size={16}/>}</div><div className="flex-1"><div className="font-medium text-sm">{x.title ?? label(x.evidenceType)}</div><div className="text-xs text-muted-foreground">{label(x.source)} · {time(x.capturedAt)} · {label(x.relatedResourceType)}</div></div><Badge tone="neutral">{x.relatedResourceId}</Badge></div>)}</div> : <EmptyState icon={I.FileText} title="No security evidence" description="Snapshots, clips and other evidence linked to security events will appear here."/>}</section>; }

function Modal({ title, children, onClose, busy }: { title: string; children: React.ReactNode; onClose: () => void; busy: boolean }) { return <div className="modal-backdrop"><div className="modal-panel max-w-xl w-full"><div className="flex justify-between items-center mb-5"><h2 className="font-semibold">{title}</h2><button onClick={onClose}><I.X size={18}/></button></div>{children}<button className="btn-primary w-full mt-5" disabled={busy} form="security-form">{busy ? 'Saving…' : 'Save'}</button></div></div>; }


function EventForm({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (v: CreateSecurityEventInput) => void }) { const [v, setV] = useState<CreateSecurityEventInput>({ propertyId:'', type:'MOTION', severity:'INFO', detectedAt:new Date().toISOString(), source:'USER' }); return <Modal title="Record security event" onClose={onClose} busy={busy}><form id="security-form" onSubmit={(e) => { e.preventDefault(); onSubmit(v); }} className="space-y-3"><input className="input" placeholder="Property ID" required value={v.propertyId} onChange={(e) => setV({...v,propertyId:e.target.value})}/><select className="input" value={v.type} onChange={(e) => setV({...v,type:e.target.value as CreateSecurityEventInput['type']})}>{['MOTION','PERSON_DETECTED','VEHICLE_DETECTED','INTRUSION','TAMPER','CAMERA_OFFLINE','CAMERA_ONLINE','AUDIO','FIRE','SMOKE','PANIC','ACCESS_DENIED','SYSTEM'].map((x)=><option key={x}>{x}</option>)}</select><StatusSelect domain="predictive" className="input" value={v.severity} onChange={(e) => setV({...v,severity:e.target.value as CreateSecurityEventInput['severity']})}>{['INFO','LOW','MEDIUM','HIGH','CRITICAL'].map((x)=><option key={x}>{x}</option>)}</StatusSelect><select className="input" value={v.source} onChange={(e) => setV({...v,source:e.target.value as CreateSecurityEventInput['source']})}>{['CCTV','ACCESS_CONTROL','SENSOR','USER','SYSTEM','INTEGRATION'].map((x)=><option key={x}>{x}</option>)}</select><textarea className="input min-h-24" placeholder="Description" value={v.description ?? ''} onChange={(e) => setV({...v,description:e.target.value})}/></form></Modal>; }

function IncidentForm({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (v: CreateIncidentInput) => void }) { const [v, setV] = useState<CreateIncidentInput>({ propertyId:'', title:'', category:'SECURITY', severity:'MEDIUM' }); return <Modal title="Report security incident" onClose={onClose} busy={busy}><form id="security-form" onSubmit={(e) => { e.preventDefault(); onSubmit(v); }} className="space-y-3"><input className="input" placeholder="Property ID" required value={v.propertyId} onChange={(e) => setV({...v,propertyId:e.target.value})}/><input className="input" placeholder="Incident title" required value={v.title} onChange={(e) => setV({...v,title:e.target.value})}/><select className="input" value={v.category} onChange={(e) => setV({...v,category:e.target.value as CreateIncidentInput['category']})}>{['SECURITY','THEFT','TRESPASS','VANDALISM','FIRE','SAFETY','ASSAULT','ACCESS_CONTROL','OTHER'].map((x)=><option key={x}>{x}</option>)}</select><StatusSelect domain="predictive" className="input" value={v.severity} onChange={(e) => setV({...v,severity:e.target.value as CreateIncidentInput['severity']})}>{['LOW','MEDIUM','HIGH','CRITICAL'].map((x)=><option key={x}>{x}</option>)}</StatusSelect><textarea className="input min-h-24" placeholder="Description" value={v.description ?? ''} onChange={(e) => setV({...v,description:e.target.value})}/></form></Modal>; }

function AccessPointForm({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (v: CreateAccessPointInput) => void }) { const [v, setV] = useState<CreateAccessPointInput>({ propertyId:'', name:'', pointCode:'', type:'MAIN_GATE' }); return <Modal title="Register access point" onClose={onClose} busy={busy}><form id="security-form" onSubmit={(e) => { e.preventDefault(); onSubmit(v); }} className="space-y-3"><input className="input" placeholder="Property ID" required value={v.propertyId} onChange={(e) => setV({...v,propertyId:e.target.value})}/><input className="input" placeholder="Access point name" required value={v.name} onChange={(e) => setV({...v,name:e.target.value})}/><input className="input" placeholder="Point code" required value={v.pointCode} onChange={(e) => setV({...v,pointCode:e.target.value})}/><select className="input" value={v.type} onChange={(e) => setV({...v,type:e.target.value as CreateAccessPointInput['type']})}>{['MAIN_GATE','PEDESTRIAN_GATE','DOOR','TURNSTILE','LIFT','PARKING','OTHER'].map((x)=><option key={x}>{x}</option>)}</select></form></Modal>; }

function CameraModal({ camera, onClose }: { camera: SecurityCamera; onClose: () => void }) { return <div className="modal-backdrop"><div className="modal-panel max-w-3xl w-full"><div className="flex justify-between items-center mb-5"><div><h2 className="font-semibold">{camera.name}</h2><p className="text-xs text-muted-foreground mt-1">{camera.cameraCode} · <StatusBadge status={label(camera.status)} domain="integration" /></p></div><button onClick={onClose}><I.X size={18}/></button></div><div className="aspect-video rounded-2xl bg-[#101828] flex items-center justify-center text-white/30"><div className="text-center"><I.Camera size={42} className="mx-auto mb-3"/><div className="text-sm">Live stream boundary</div><div className="text-xs mt-1 text-white/40">Provider integration supplies the actual stream/playback reference.</div></div></div><div className="grid sm:grid-cols-2 gap-3 mt-4"><div className="p-3 rounded-xl bg-muted"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Live reference</div><div className="text-sm mt-1 break-all">{camera.streamRef ?? 'Not configured'}</div></div><div className="p-3 rounded-xl bg-muted"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Playback reference</div><div className="text-sm mt-1 break-all">{camera.playbackRef ?? 'Not configured'}</div></div></div></div></div>; }
