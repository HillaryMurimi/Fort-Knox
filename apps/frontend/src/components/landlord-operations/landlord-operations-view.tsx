'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Copy, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Alert, Button, Input, Select } from '@/components/ui';
import { landlordOperationsClient as client, type LandlordDetail } from '@/lib/data/landlord-operations';

const date = (value?: string) => value ? new Date(value).toLocaleString() : 'Not yet';
const money = (minor: number, currency: string) => new Intl.NumberFormat('en-KE', { style: 'currency', currency }).format(minor / 100);

export function LandlordOperationsView() {
  const auth = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [invitation, setInvitation] = useState<{ token: string; expiresAt: string } | null>(null);
  const [purpose, setPurpose] = useState('Help set up the property and unit inventory with the owner present.');
  const [planKey, setPlanKey] = useState<'CONTROL' | 'FORT_KNOX'>('CONTROL');
  const [days, setDays] = useState(14);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState<{ totalMinor: number; unitCount: number; currency: string } | null>(null);
  const enabled = auth.roles.includes('SUPER_ADMIN') && !auth.isDevMode;
  const overview = useQuery({ queryKey: ['landlord-operations', 'overview'], queryFn: client.overview, enabled });
  const directory = useQuery({ queryKey: ['landlord-operations', 'directory', search, status, page], queryFn: () => client.directory(search, status, page), enabled });
  const detail = useQuery({ queryKey: ['landlord-operations', 'detail', selected], queryFn: () => client.detail(selected!), enabled: enabled && !!selected });

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      await action();
      setNotice(message);
      await qc.invalidateQueries({ queryKey: ['landlord-operations'] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The operation could not be completed.');
    } finally { setBusy(false); }
  }

  if (!enabled) return <Alert tone="warning">A real SUPER_ADMIN session is required. Development preview cannot perform landlord operations.</Alert>;
  const organization = detail.data;
  const activeSupport = organization?.supportSessions.find(session => session.status === 'ACTIVE');
  const pendingSupport = organization?.supportSessions.find(session => session.status === 'REQUESTED');
  const pilot = organization?.organization.guidedPilot;
  const pilotActive = !!pilot && Date.parse(pilot.expiresAt) > detail.dataUpdatedAt && organization?.onboardingState !== 'ACTIVE';

  return <main className="mx-auto max-w-7xl space-y-7 pb-16">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div><p className="text-xs font-semibold uppercase text-muted-foreground">Platform / Landlord operations</p><h1 className="mt-1 text-3xl font-semibold">Assisted onboarding</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Verified owners, consented setup, bounded pilots and an owner-completed billing handoff.</p></div>
      <Button variant="outline" onClick={() => { void overview.refetch(); void directory.refetch(); if (selected) void detail.refetch(); }}><RefreshCw size={16} /> Refresh</Button>
    </header>
    {error && <Alert tone="destructive" title="Action failed">{error}</Alert>}
    {notice && <Alert tone="success">{notice}</Alert>}
    {overview.isError && <Alert tone="destructive">Could not load overview. <Button variant="link" onClick={() => void overview.refetch()}>Retry</Button></Alert>}
    <dl className="grid grid-cols-2 gap-3 border-b border-border pb-6 md:grid-cols-5">
      {([['Landlords', overview.data?.totalLandlords], ['Incomplete', overview.data?.incompleteOnboarding], ['Active pilots', overview.data?.activePilots], ['Paying', overview.data?.payingOrganizations], ['Support active', overview.data?.activeSupportSessions]] as const).map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{value ?? '...'}</dd></div>)}
    </dl>
    <section aria-label="Create assisted organization" className="space-y-3 border-b border-border pb-6">
      <div className="flex items-center gap-2"><Plus size={18} /><h2 className="text-lg font-semibold">Invite a new owner</h2></div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <Input aria-label="Organization name" placeholder="Organization name" value={newName} onChange={event => setNewName(event.target.value)} />
        <Input aria-label="Owner email" placeholder="Owner email" type="email" value={newEmail} onChange={event => setNewEmail(event.target.value)} />
        <Button disabled={busy || !newName.trim() || !newEmail.trim()} onClick={() => void run(async () => { const result = await client.createOrganization(newName.trim(), newEmail.trim()); setInvitation({ token: result.invitationToken, expiresAt: result.expiresAt }); setSelected(result.organizationId); setNewName(''); setNewEmail(''); }, 'Organization created. Deliver the invitation securely to the intended owner.')}>Create & invite</Button>
      </div>
      {invitation && <Alert tone="warning" title="Secure manual delivery required"><p className="mb-2">This one-use invitation is shown only here. Confirm the recipient separately; do not post it in a public channel. Expires {date(invitation.expiresAt)}.</p><div className="flex flex-wrap items-center gap-2"><code className="max-w-full break-all text-xs">{invitation.token}</code><Button variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(invitation.token)} aria-label="Copy invitation token"><Copy size={14} /> Copy</Button></div></Alert>}
    </section>
    <div className="grid gap-7 lg:grid-cols-[minmax(260px,360px)_minmax(0,1fr)]">
      <section aria-label="Landlord directory" className="min-w-0">
        <h2 className="mb-3 text-lg font-semibold">Organizations</h2>
        <div className="flex gap-2"><Input aria-label="Search organizations" placeholder="Name or owner" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /><Select aria-label="Filter status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="ALL">All</option><option value="INCOMPLETE">Incomplete</option><option value="PILOT">Pilot</option><option value="PAID">Paid</option></Select></div>
        {directory.isLoading && <p role="status" className="mt-4 text-sm">Loading organizations...</p>}
        {directory.isError && <Alert tone="destructive" className="mt-3">Directory unavailable. <Button variant="link" onClick={() => void directory.refetch()}>Retry</Button></Alert>}
        <div className="mt-3 divide-y divide-border border-y border-border">
          {directory.data?.items.map(item => <button key={item.id} onClick={() => { setSelected(item.id); setQuote(null); setPlanKey(item.pilot?.planKey ?? 'CONTROL'); }} className={`flex w-full items-center justify-between gap-3 px-2 py-3 text-left hover:bg-muted ${selected === item.id ? 'bg-muted' : ''}`} aria-pressed={selected === item.id}><span className="min-w-0"><strong className="block truncate text-sm">{item.name}</strong><small className="text-muted-foreground">{item.configuredUnits} units / {item.properties} properties / {item.onboardingState}</small></span><ArrowRight size={15} className="shrink-0" /></button>)}
          {directory.data?.items.length === 0 && <p className="py-5 text-sm text-muted-foreground">No organizations match this filter.</p>}
        </div>
        <div className="mt-3 flex items-center justify-between text-sm"><span>{directory.data?.total ?? 0} organizations</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={!directory.data || page * directory.data.pageSize >= directory.data.total} onClick={() => setPage(page + 1)}>Next</Button></div></div>
      </section>
      <section aria-label="Organization detail" className="min-w-0 space-y-6">
        {!selected && <p className="border-t border-border pt-5 text-sm text-muted-foreground">Select an organization to review onboarding and take action.</p>}
        {detail.isLoading && <p role="status">Loading organization...</p>}
        {detail.isError && <Alert tone="destructive">Details unavailable. <Button variant="link" onClick={() => void detail.refetch()}>Retry</Button></Alert>}
        {organization && <>
          <div className="border-b border-border pb-4"><h2 className="text-2xl font-semibold">{organization.organization.name}</h2><p className="mt-1 text-sm text-muted-foreground">{organization.onboardingState} / {organization.configuredUnits} configured units / {organization.outstandingUnits} remaining declared</p><p className="mt-1 text-sm">Owner: {organization.ownerAccount?.name ?? 'Invitation pending'} {organization.ownerAccount?.verified ? <span className="text-emerald-700">(verified)</span> : '(unverified)'}</p><p className="text-xs text-muted-foreground">Last activity: {date(organization.lastActivity?.occurredAt)}</p></div>
          <SupportControls organization={organization} purpose={purpose} setPurpose={setPurpose} busy={busy} pendingSupport={!!pendingSupport} activeSupport={activeSupport} run={run} />
          <section className="space-y-3 border-t border-border pt-5"><h3 className="font-semibold">Guided pilot</h3><p className="text-sm text-muted-foreground">An evaluation entitlement, not a subscription or invoice. Maximum cumulative duration: 60 days.</p><div className="flex flex-wrap gap-2"><Select aria-label="Pilot plan" value={planKey} onChange={event => setPlanKey(event.target.value as 'CONTROL' | 'FORT_KNOX')} disabled={!!pilot}><option value="CONTROL">Control</option><option value="FORT_KNOX">Fort Knox</option></Select><Input className="w-24" aria-label="Pilot days" type="number" min={1} max={60} value={days} onChange={event => setDays(Number(event.target.value))} /><Button disabled={busy || !organization.ownerAccount?.verified || !Number.isInteger(days) || days < 1 || days > 60 || (!!pilot && !pilotActive)} onClick={() => void run(() => pilot ? client.extendPilot(selected!, days) : client.grantPilot(selected!, organization.ownerAccount!.id, planKey, days), pilot ? 'Pilot extended.' : 'Pilot granted.')}>{pilot ? 'Extend pilot' : 'Grant pilot'}</Button></div>{pilot && <div className="flex flex-wrap items-center gap-3 text-sm"><span>{pilot.planKey} until {date(pilot.expiresAt)} {pilotActive ? '(active)' : '(ended)'}</span>{pilotActive && <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => client.terminatePilot(selected!), 'Pilot terminated.')}>Terminate</Button>}</div>}</section>
          <section className="space-y-3 border-t border-border pt-5"><h3 className="font-semibold">Conversion handoff</h3><p className="text-sm text-muted-foreground">Uses current active inventory for a server-calculated quote. The owner must review, sign and pay through their own account.</p><div className="flex flex-wrap gap-2"><Select aria-label="Conversion plan" value={planKey} onChange={event => setPlanKey(event.target.value as 'CONTROL' | 'FORT_KNOX')}><option value="CONTROL">Control</option><option value="FORT_KNOX">Fort Knox</option></Select><Button disabled={busy || !organization.ownerAccount?.verified} onClick={() => void run(async () => { const result = await client.prepareConversion(selected!, planKey); setQuote(result.quote); }, 'Quote prepared. Ask the owner to complete onboarding, sign and pay.')}>Prepare conversion</Button></div>{quote && <p className="text-sm"><strong>{money(quote.totalMinor, quote.currency)}</strong> for {quote.unitCount} units. The owner completes the agreement and checkout in their onboarding workspace.</p>}</section>
          <section className="border-t border-border pt-5"><h3 className="font-semibold">Properties & activity</h3><p className="mt-2 text-sm">{organization.properties.map(property => property.name).join(', ') || 'No property configured yet.'}</p><p className="mt-1 text-xs text-muted-foreground">{organization.supportSessions.length} recent support sessions / {organization.subscription?.status ?? 'No subscription'}</p></section>
        </>}
      </section>
    </div>
  </main>;
}

function SupportControls({ organization, purpose, setPurpose, busy, pendingSupport, activeSupport, run }: { organization: LandlordDetail; purpose: string; setPurpose: (value: string) => void; busy: boolean; pendingSupport: boolean; activeSupport: LandlordDetail['supportSessions'][number] | undefined; run: (action: () => Promise<unknown>, message: string) => Promise<void> }) {
  const id = organization.organization._id;
  return <section className="space-y-3"><div className="flex items-center gap-2"><ShieldCheck size={18} /><h3 className="font-semibold">Owner-consented setup</h3></div><p className="text-sm text-muted-foreground">Request expires unless the verified owner approves. Access is scoped to property setup and your privileged session.</p>{activeSupport ? <><Alert tone="success" title="Support session active"><p>Approved until {date(activeSupport.expiresAt)}. {activeSupport.useCount} actions recorded.</p><div className="mt-3 flex flex-wrap gap-2"><Link className="btn-primary" href={`/landlord-operations/${id}/setup?session=${activeSupport._id}`}>Set up property <ArrowRight size={14} /></Link><Button variant="outline" disabled={busy} onClick={() => void run(() => client.endSupport(activeSupport._id), 'Support session ended.')}>End session</Button></div></Alert><SupportUnitForm organization={organization} sessionId={activeSupport._id} busy={busy} run={run} /></> : pendingSupport ? <Alert tone="warning">Awaiting owner approval. The owner can approve or reject in Support access.</Alert> : <><textarea aria-label="Support request purpose" className="min-h-20 w-full rounded-md border border-border bg-background p-3 text-sm" value={purpose} maxLength={500} onChange={event => setPurpose(event.target.value)} /><Button disabled={busy || !organization.ownerAccount?.verified || purpose.trim().length < 10} onClick={() => void run(() => client.requestSupport(id, organization.ownerAccount!.id, purpose.trim()), 'Support request sent to the owner for approval.')}>Request access</Button></>}</section>;
}

function SupportUnitForm({ organization, sessionId, busy, run }: { organization: LandlordDetail; sessionId: string; busy: boolean; run: (action: () => Promise<unknown>, message: string) => Promise<void> }) {
  const [floorId, setFloorId] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [unitType, setUnitType] = useState('ONE_BEDROOM');
  const [monthlyRent, setMonthlyRent] = useState('');
  if (!organization.floors.length) return null;
  return <div className="space-y-3 border-t border-border pt-4"><h4 className="text-sm font-semibold">Add a unit to an existing floor</h4><div className="grid gap-2 sm:grid-cols-2"><Select aria-label="Unit floor" value={floorId} onChange={event => setFloorId(event.target.value)}><option value="">Select floor</option>{organization.floors.map(floor => <option key={floor._id} value={floor._id}>{floor.name} ({floor.code}) - {floor.configuredUnits} units</option>)}</Select><Select aria-label="Unit type" value={unitType} onChange={event => setUnitType(event.target.value)}><option value="SINGLE_ROOM">Single room</option><option value="BEDSITTER">Bedsitter</option><option value="STUDIO">Studio</option><option value="ONE_BEDROOM">One bedroom</option><option value="TWO_BEDROOM">Two bedrooms</option><option value="THREE_PLUS_BEDROOM">Three bedrooms</option><option value="SHOP">Shop</option><option value="OFFICE">Office</option><option value="OTHER">Other</option></Select><Input aria-label="Unit name" placeholder="Unit name" value={name} onChange={event => setName(event.target.value)} /><Input aria-label="Unit code" placeholder="Unique unit code" value={code} onChange={event => setCode(event.target.value)} /><Input aria-label="Monthly rent in KES" type="number" min={0} step="0.01" placeholder="Monthly rent (KES)" value={monthlyRent} onChange={event => setMonthlyRent(event.target.value)} /></div><Button disabled={busy || !floorId || !name.trim() || !code.trim() || monthlyRent === '' || !Number.isFinite(Number(monthlyRent)) || Number(monthlyRent) < 0} onClick={() => void run(async () => { await client.addUnit(sessionId, { floorId, name: name.trim(), code: code.trim(), unitType, monthlyRent: Number(monthlyRent) }); setName(''); setCode(''); setMonthlyRent(''); }, 'Unit added to the owner organization.')}>Add unit</Button></div>;
}
