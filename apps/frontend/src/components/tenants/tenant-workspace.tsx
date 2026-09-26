'use client';

import { useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, ArrowRight, Bell, CalendarDays, Camera, Check, CheckCircle2, Clock3,
  CreditCard, Download, ExternalLink, FileText, Home, ImagePlus, LifeBuoy, LogOut, Mail,
  MessageSquare, Phone, ReceiptText, RefreshCw, ShieldCheck, Trash2, UserRound, Video, Wrench,
} from 'lucide-react';
import { RoleLanding } from '@/components/auth/role-landing';
import { LocalGreeting } from '@/components/local-greeting';
import { PayRentDialog } from '@/components/payments/pay-rent-dialog';
import { Alert, Badge, Button, Card, Dialog, EmptyState, Input, Label, Select, Skeleton, Textarea, Tooltip } from '@/components/ui';
import { useOrganization } from '@/context/organization-context';
import { useAuth } from '@/hooks/use-auth';
import { useDocumentsQuery, useSignedStorageUrlMutation } from '@/hooks/queries/use-document-queries';
import { usePaymentsQuery, useRentChargesQuery } from '@/hooks/queries/use-finance-queries';
import { useBuildingQuery, useUnitQuery } from '@/hooks/queries/use-hierarchy-queries';
import { useAddMaintenanceEvidenceMutation, useCreateMaintenanceMutation, useMaintenanceQuery } from '@/hooks/queries/use-maintenance-queries';
import { useNotificationReadMutation, useNotificationsQuery } from '@/hooks/queries/use-operations-queries';
import { usePropertyQuery } from '@/hooks/queries/use-property-queries';
import { useTenanciesQuery, useTenantsQuery } from '@/hooks/queries/use-tenant-queries';
import type { DocumentRecord, MaintenanceRequest, NotificationRecord, Payment, RentCharge, Tenancy } from '@/lib/data/resource-types';
import { currency } from '@/lib/presentation';
import {
  nextRentCharge, openMaintenanceCount, outstandingBalance, selectCurrentTenancy,
  selectTenant, selectTenantDocuments, selectTenantMaintenance, selectTenantNotifications,
  selectTenantPayments, selectTenantRent, unreadNotificationCount,
} from './tenant-dashboard';
import { isVideoMedia, validateMaintenanceMedia } from './maintenance-media';

type TenantPanel = 'rent' | 'maintenance' | 'report' | 'documents' | 'notifications' | 'contact' | 'account' | null;

export function TenantWorkspace() {
  const [panel, setPanel] = useState<TenantPanel>(null);
  const [payRentOpen, setPayRentOpen] = useState(false);
  const { activeOrganizationId, activeOrganization } = useOrganization();
  const { user, roles, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const tenantsQuery = useTenantsQuery(activeOrganizationId);
  const tenanciesQuery = useTenanciesQuery(activeOrganizationId);
  const rentQuery = useRentChargesQuery(activeOrganizationId);
  const paymentsQuery = usePaymentsQuery(activeOrganizationId);
  const maintenanceQuery = useMaintenanceQuery(activeOrganizationId);
  const documentsQuery = useDocumentsQuery(activeOrganizationId);
  const notificationsQuery = useNotificationsQuery(activeOrganizationId, { limit: 100 });
  const tenant = useMemo(() => selectTenant(tenantsQuery.data ?? [], user?._id), [tenantsQuery.data, user?._id]);
  const tenancy = useMemo(() => selectCurrentTenancy(tenanciesQuery.data ?? [], tenant?._id), [tenanciesQuery.data, tenant?._id]);
  const unitQuery = useUnitQuery(activeOrganizationId, tenancy?.unitId ?? null);
  const buildingQuery = useBuildingQuery(activeOrganizationId, tenancy?.buildingId ?? null);
  const propertyQuery = usePropertyQuery(activeOrganizationId, tenancy?.propertyId ?? null);
  const rent = useMemo(() => selectTenantRent(rentQuery.data ?? [], tenancy?._id), [rentQuery.data, tenancy?._id]);
  const payments = useMemo(() => selectTenantPayments(paymentsQuery.data ?? [], tenancy?._id), [paymentsQuery.data, tenancy?._id]);
  const maintenance = useMemo(() => selectTenantMaintenance(maintenanceQuery.data ?? [], tenant?._id, tenancy?.unitId), [maintenanceQuery.data, tenant?._id, tenancy?.unitId]);
  const documents = useMemo(() => selectTenantDocuments(documentsQuery.data ?? [], user?._id, tenancy?.unitId, tenancy?.propertyId), [documentsQuery.data, user?._id, tenancy?.unitId, tenancy?.propertyId]);
  const notifications = useMemo(() => selectTenantNotifications(notificationsQuery.data ?? [], user?._id), [notificationsQuery.data, user?._id]);

  if (!isAuthenticated || !roles.includes('TENANT')) return <RoleLanding role="TENANT" title="Tenant Workspace" />;
  const loadingIdentity = tenantsQuery.isLoading || tenanciesQuery.isLoading;
  const loadError = tenantsQuery.error ?? tenanciesQuery.error;
  const balance = outstandingBalance(rent);
  const nextCharge = nextRentCharge(rent);
  const openRequests = openMaintenanceCount(maintenance);
  const unread = unreadNotificationCount(notifications);
  const firstName = user?.firstName?.trim() || 'Resident';

  return <main id="main-content" className="min-h-screen bg-[var(--muted)]">
    <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
      <TenantHeader firstName={firstName} unread={unread} onNotifications={() => setPanel('notifications')} onAccount={() => setPanel('account')} />
      {loadError ? <Alert tone="destructive" title="Your resident workspace could not be loaded" className="mt-6"><div className="flex flex-wrap items-center gap-3"><span>{loadError.message}</span><Button variant="outline" size="sm" onClick={() => void Promise.all([tenantsQuery.refetch(), tenanciesQuery.refetch()])}><RefreshCw size={14} /> Retry</Button></div></Alert>
      : loadingIdentity ? <TenantWorkspaceSkeleton />
      : !tenant || !tenancy ? <div className="mt-6"><EmptyState icon={Home} title="No active tenancy is connected" description="Your account is signed in, but management has not attached an active or pending tenancy yet." action={<Button variant="outline" onClick={() => setPanel('contact')}><LifeBuoy size={16} /> Contact management</Button>} /></div>
      : <div className="mt-6 space-y-6">
        <ResidenceBanner tenancy={tenancy} propertyName={propertyQuery.data?.name} buildingName={buildingQuery.data?.name} unitName={unitQuery.data?.name} organizationName={activeOrganization?.name} balance={balance} />
        <section aria-label="Tenancy overview" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OverviewButton icon={CreditCard} label="Rent balance" value={balance > 0 ? currency(balance, nextCharge?.currency ?? 'KES') : 'Paid up'} detail={balance > 0 ? 'Review charges and pay securely' : 'No outstanding rent charges'} tone={balance > 0 ? 'attention' : 'positive'} onClick={() => setPanel('rent')} />
          <OverviewButton icon={CalendarDays} label="Next due date" value={nextCharge ? formatDate(nextCharge.dueDate, { day: '2-digit', month: 'short' }) : 'No balance due'} detail={nextCharge ? `${nextCharge.currency} ${nextCharge.balanceAmount.toLocaleString('en-KE')} outstanding` : 'Open the rent ledger'} onClick={() => setPanel('rent')} />
          <OverviewButton icon={Wrench} label="Maintenance" value={`${openRequests} open`} detail={openRequests === 1 ? 'Active service request' : 'Active service requests'} tone={openRequests > 0 ? 'attention' : 'positive'} onClick={() => setPanel('maintenance')} />
          <OverviewButton icon={FileText} label="Documents" value={`${documents.length}`} detail="Authorized tenancy files" onClick={() => setPanel('documents')} />
        </section>
        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <WorkspaceSection icon={Wrench} title="Maintenance" description="Requests for your current home" action={<Button variant="ghost" size="sm" onClick={() => setPanel('maintenance')}>View all <ArrowRight size={14} /></Button>}>
            {maintenanceQuery.isLoading ? <RowsSkeleton /> : maintenance.length ? <div className="divide-y divide-border">{maintenance.slice(0, 3).map((request) => <MaintenanceRow key={request._id} request={request} onClick={() => setPanel('maintenance')} />)}</div> : <CompactEmpty icon={CheckCircle2} title="Everything looks good" description="You have no maintenance requests for this home." />}
            <div className="border-t border-border p-4"><Button className="w-full sm:w-auto" onClick={() => setPanel('report')}><Wrench size={16} /> Report an issue</Button></div>
          </WorkspaceSection>
          <WorkspaceSection icon={FileText} title="Documents" description="Files shared with you" action={<Button variant="ghost" size="sm" onClick={() => setPanel('documents')}>View all <ArrowRight size={14} /></Button>}>
            {documentsQuery.isLoading ? <RowsSkeleton count={3} /> : documents.length ? <div className="divide-y divide-border px-2 py-2">{documents.slice(0, 4).map((document) => <button key={document._id} type="button" onClick={() => setPanel('documents')} className="flex w-full items-center gap-3 rounded-md px-2 py-3 text-left transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground"><FileText size={16} /></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{document.title}</div><div className="mt-0.5 text-xs text-muted-foreground">{titleCase(document.category)} · {formatFileSize(document.sizeBytes)}</div></div><Download className="shrink-0 text-muted-foreground" size={15} /></button>)}</div> : <CompactEmpty icon={FileText} title="No shared documents" description="Authorized files will appear here." />}
          </WorkspaceSection>
        </div>
        <WorkspaceSection icon={Bell} title="Property updates" description="Messages and activity for your account" action={<Button variant="ghost" size="sm" onClick={() => setPanel('notifications')}>View all <ArrowRight size={14} /></Button>}>
          {notificationsQuery.isLoading ? <RowsSkeleton count={2} /> : notifications.length ? <div className="divide-y divide-border">{notifications.slice(0, 3).map((notification) => <NotificationRow key={notification._id} notification={notification} onClick={() => setPanel('notifications')} />)}</div> : <CompactEmpty icon={Bell} title="You are all caught up" description="New messages and payment updates will appear here." />}
        </WorkspaceSection>
        <QuickActions onPayRent={() => setPayRentOpen(true)} onReport={() => setPanel('report')} onDocuments={() => setPanel('documents')} onContact={() => setPanel('contact')} />
      </div>}
    </div>
    <PayRentDialog organizationId={activeOrganizationId} open={payRentOpen} onOpenChange={setPayRentOpen} />
    <RentLedgerDialog open={panel === 'rent'} onOpenChange={(open) => setPanel(open ? 'rent' : null)} charges={rent} payments={payments} onPay={() => { setPanel(null); setPayRentOpen(true); }} />
    <MaintenanceDialog open={panel === 'maintenance'} onOpenChange={(open) => setPanel(open ? 'maintenance' : null)} requests={maintenance} onReport={() => setPanel('report')} />
    <ReportIssueDialog open={panel === 'report'} onOpenChange={(open) => setPanel(open ? 'report' : null)} organizationId={activeOrganizationId} tenantId={tenant?._id} unitId={tenancy?.unitId} />
    <DocumentsDialog open={panel === 'documents'} onOpenChange={(open) => setPanel(open ? 'documents' : null)} organizationId={activeOrganizationId} documents={documents} />
    <NotificationsDialog open={panel === 'notifications'} onOpenChange={(open) => setPanel(open ? 'notifications' : null)} organizationId={activeOrganizationId} notifications={notifications} />
    <ContactDialog open={panel === 'contact'} onOpenChange={(open) => setPanel(open ? 'contact' : null)} organizationName={activeOrganization?.name} phone={activeOrganization?.settings?.managementPhone} email={activeOrganization?.settings?.managementEmail} emergencyPhone={activeOrganization?.settings?.emergencyPhone} officeHours={activeOrganization?.settings?.officeHours} onReport={() => setPanel('report')} />
    <AccountDialog open={panel === 'account'} onOpenChange={(open) => setPanel(open ? 'account' : null)} name={`${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim()} phone={user?.phone} email={user?.email} organizationName={activeOrganization?.name} leaseNumber={tenancy?.leaseNumber} onLogout={async () => { await logout(); router.replace('/login'); }} />
  </main>;
}

function TenantHeader({ firstName, unread, onNotifications, onAccount }: { firstName: string; unread: number; onNotifications: () => void; onAccount: () => void }) {
  return <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground"><span>Resident portal</span><span aria-hidden="true">/</span><span className="text-foreground">Home</span></div><h1 className="text-2xl font-semibold text-foreground sm:text-3xl"><LocalGreeting name={firstName} /></h1><p className="mt-1 text-sm text-muted-foreground">Your home, payments, requests, and documents in one place.</p></div><div className="flex items-center gap-2 self-end sm:self-auto"><Tooltip label="Notifications"><Button type="button" variant="outline" size="icon" className="relative" onClick={onNotifications} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}><Bell size={18} />{unread > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[var(--panel)] bg-[var(--destructive)] px-1 text-[9px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}</Button></Tooltip><Button type="button" variant="outline" onClick={onAccount}><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary)] text-[10px] font-bold text-white">{firstName.charAt(0).toUpperCase()}</span><span className="hidden sm:block">Account</span></Button></div></header>;
}

function ResidenceBanner({ tenancy, propertyName, buildingName, unitName, organizationName, balance }: { tenancy: Tenancy; propertyName: string | undefined; buildingName: string | undefined; unitName: string | undefined; organizationName: string | undefined; balance: number }) {
  return <section className="overflow-hidden rounded-lg border border-[#26344a] bg-[#101828] text-white shadow-sm"><div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center"><div className="flex items-start gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/10"><Home size={20} /></div><div><div className="text-[10px] font-semibold uppercase text-white/55">Current residence</div><h2 className="mt-1 text-xl font-semibold">{propertyName ?? 'Your property'}</h2><p className="mt-1 text-sm text-white/65">{[buildingName, unitName].filter(Boolean).join(' · ') || `Lease ${tenancy.leaseNumber}`}</p></div></div><div className="flex flex-wrap gap-2"><span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs"><ShieldCheck size={13} />{titleCase(tenancy.status)} tenancy</span><span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs">{balance <= 0 ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}{balance <= 0 ? 'Rent account current' : 'Balance requires attention'}</span></div></div><div className="grid border-t border-white/10 bg-white/[0.03] sm:grid-cols-3"><IdentityMetric label="Lease" value={tenancy.leaseNumber} /><IdentityMetric label="Lease period" value={`${formatDate(tenancy.startDate)} - ${tenancy.endDate ? formatDate(tenancy.endDate) : 'Open-ended'}`} /><IdentityMetric label="Management" value={organizationName ?? 'Property management'} /></div></section>;
}

function IdentityMetric({ label, value }: { label: string; value: string }) { return <div className="border-b border-white/10 px-5 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><div className="text-[10px] font-semibold uppercase text-white/40">{label}</div><div className="mt-1 truncate text-xs font-medium text-white/80">{value}</div></div>; }
function OverviewButton({ icon: Icon, label, value, detail, tone, onClick }: { icon: typeof CreditCard; label: string; value: string; detail: string; tone?: 'positive' | 'attention'; onClick: () => void }) { return <button type="button" onClick={onClick} className="group card min-h-36 p-4 text-left transition hover:border-[var(--border-strong)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"><div className="flex items-start justify-between"><div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground"><Icon size={17} /></div><div className="flex items-center gap-2">{tone && <span className={`h-2 w-2 rounded-full ${tone === 'positive' ? 'bg-emerald-500' : 'bg-amber-500'}`} />}<ArrowRight size={15} className="text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" /></div></div><div className="mt-4 text-xs font-medium text-muted-foreground">{label}</div><div className="mt-1 break-words text-lg font-semibold text-foreground">{value}</div><div className="mt-1 text-[11px] text-muted-foreground">{detail}</div></button>; }
function WorkspaceSection({ icon: Icon, title, description, action, children }: { icon: typeof Wrench; title: string; description: string; action: ReactNode; children: ReactNode }) { return <Card className="overflow-hidden"><div className="flex items-center justify-between gap-4 border-b border-border p-4"><div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground"><Icon size={17} /></div><div className="min-w-0"><h2 className="text-sm font-semibold">{title}</h2><p className="truncate text-xs text-muted-foreground">{description}</p></div></div>{action}</div>{children}</Card>; }
function MaintenanceRow({ request, onClick }: { request: MaintenanceRequest; onClick: () => void }) { return <button type="button" onClick={onClick} className="flex w-full gap-3 p-4 text-left transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]"><div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${request.priority === 'EMERGENCY' ? 'bg-[#fef3f2] text-[#b42318]' : 'bg-[#fffaeb] text-[#b54708]'}`}><Wrench size={16} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{request.title}</h3><Badge tone={maintenanceTone(request.status)}>{titleCase(request.status)}</Badge></div><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{request.description}</p><div className="mt-2 text-[11px] text-muted-foreground">{titleCase(request.category)} · Updated {relativeDate(request.updatedAt ?? request.createdAt)}</div></div><ArrowRight className="mt-1 shrink-0 text-muted-foreground" size={15} /></button>; }
function NotificationRow({ notification, onClick }: { notification: NotificationRecord; onClick: () => void }) { const unread = notification.status !== 'READ'; return <button type="button" onClick={onClick} className="flex w-full gap-3 p-4 text-left transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]"><div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${unread ? 'bg-[#eff8ff] text-[#175cd3]' : 'bg-muted text-muted-foreground'}`}><Bell size={16} /></div><div className="min-w-0 flex-1"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><h3 className="text-sm font-semibold">{notification.title}</h3><span className="text-[11px] text-muted-foreground">{relativeDate(notification.createdAt ?? notification.sentAt)}</span></div><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{notification.body}</p></div>{unread && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-label="Unread" />}</button>; }

function QuickActions({ onPayRent, onReport, onDocuments, onContact }: { onPayRent: () => void; onReport: () => void; onDocuments: () => void; onContact: () => void }) {
  const actions = [{ icon: CreditCard, label: 'Pay rent', description: 'M-Pesa or secure checkout', onClick: onPayRent }, { icon: Wrench, label: 'Report issue', description: 'Send a maintenance request', onClick: onReport }, { icon: FileText, label: 'Documents', description: 'Open authorized files', onClick: onDocuments }, { icon: MessageSquare, label: 'Contact management', description: 'Call or email the property team', onClick: onContact }];
  return <section><div className="mb-3"><h2 className="text-sm font-semibold">Quick actions</h2><p className="mt-0.5 text-xs text-muted-foreground">The things residents need most</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{actions.map(({ icon: Icon, label, description, onClick }) => <button key={label} type="button" onClick={onClick} className="group card min-h-32 p-4 text-left transition hover:border-[var(--border-strong)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"><div className="flex items-center justify-between"><div className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--primary)] text-white"><Icon size={16} /></div><ArrowRight size={16} className="text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" /></div><div className="mt-4 text-sm font-semibold">{label}</div><div className="mt-1 text-xs text-muted-foreground">{description}</div></button>)}</div></section>;
}

function RentLedgerDialog({ open, onOpenChange, charges, payments, onPay }: { open: boolean; onOpenChange: (open: boolean) => void; charges: RentCharge[]; payments: Payment[]; onPay: () => void }) {
  const [view, setView] = useState<'charges' | 'payments'>('charges'); const balance = outstandingBalance(charges);
  return <Dialog open={open} onOpenChange={onOpenChange} title="Rent account" description="Your scoped charges and confirmed payment history." className="max-w-3xl"><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-md border border-border bg-muted p-4"><div className="text-xs text-muted-foreground">Outstanding balance</div><div className="mt-1 text-xl font-semibold">{currency(balance, charges[0]?.currency ?? 'KES')}</div></div><div className="rounded-md border border-border bg-muted p-4"><div className="text-xs text-muted-foreground">Confirmed payments</div><div className="mt-1 text-xl font-semibold">{payments.filter((payment) => payment.status === 'CONFIRMED').length}</div></div></div><div className="mt-5 flex gap-1 rounded-md border border-border bg-muted p-1" role="tablist"><button type="button" role="tab" aria-selected={view === 'charges'} onClick={() => setView('charges')} className={`h-9 flex-1 rounded text-xs font-semibold ${view === 'charges' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>Charges</button><button type="button" role="tab" aria-selected={view === 'payments'} onClick={() => setView('payments')} className={`h-9 flex-1 rounded text-xs font-semibold ${view === 'payments' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>Payments</button></div><div className="mt-4 max-h-[42vh] divide-y divide-border overflow-y-auto border-y border-border">{view === 'charges' ? (charges.length ? charges.map((charge) => <div key={charge._id} className="flex items-center justify-between gap-4 py-4"><div><div className="text-sm font-semibold">Rent due {formatDate(charge.dueDate)}</div><div className="mt-1 text-xs text-muted-foreground">{formatDate(charge.periodStart)} - {formatDate(charge.periodEnd)}</div></div><div className="text-right"><div className="text-sm font-semibold">{currency(charge.balanceAmount, charge.currency)}</div><Badge tone={charge.status === 'PAID' ? 'green' : charge.status === 'OVERDUE' ? 'red' : 'orange'}>{titleCase(charge.status)}</Badge></div></div>) : <CompactEmpty icon={ReceiptText} title="No rent charges" description="Your rent ledger is empty." />) : (payments.length ? payments.map((payment) => <div key={payment._id} className="flex items-center justify-between gap-4 py-4"><div><div className="text-sm font-semibold">{titleCase(payment.method)} payment</div><div className="mt-1 text-xs text-muted-foreground">{formatDate(payment.paidAt ?? payment.createdAt)}{payment.receiptNumber ? ` · ${payment.receiptNumber}` : ''}</div></div><div className="text-right"><div className="text-sm font-semibold">{currency(payment.amount, payment.currency)}</div><Badge tone={payment.status === 'CONFIRMED' ? 'green' : payment.status === 'FAILED' || payment.status === 'REVERSED' ? 'red' : 'orange'}>{titleCase(payment.status)}</Badge></div></div>) : <CompactEmpty icon={ReceiptText} title="No payments yet" description="Successful payments will appear here after provider confirmation." />)}</div><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button><Button onClick={onPay} disabled={balance <= 0}><CreditCard size={16} />{balance > 0 ? 'Pay outstanding rent' : 'Rent is paid'}</Button></div></Dialog>;
}

function MaintenanceDialog({ open, onOpenChange, requests, onReport }: { open: boolean; onOpenChange: (open: boolean) => void; requests: MaintenanceRequest[]; onReport: () => void }) { return <Dialog open={open} onOpenChange={onOpenChange} title="Maintenance requests" description="Track every issue reported for your home." className="max-w-3xl"><div className="max-h-[58vh] divide-y divide-border overflow-y-auto border-y border-border">{requests.length ? requests.map((request) => <div key={request._id} className="py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{request.title}</h3><Badge tone={maintenanceTone(request.status)}>{titleCase(request.status)}</Badge></div><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{request.description}</p></div><Badge tone={request.priority === 'EMERGENCY' ? 'red' : request.priority === 'HIGH' ? 'orange' : 'neutral'}>{titleCase(request.priority)}</Badge></div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{titleCase(request.category)}</span><span>Request {request._id.slice(-8).toUpperCase()}</span><span>Updated {relativeDate(request.updatedAt ?? request.createdAt)}</span></div></div>) : <CompactEmpty icon={Wrench} title="No requests yet" description="Report an issue and the property team can triage it." />}</div><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button><Button onClick={onReport}><Wrench size={16} /> Report an issue</Button></div></Dialog>; }

function ReportIssueDialog({ open, onOpenChange, organizationId, tenantId, unitId }: { open: boolean; onOpenChange: (open: boolean) => void; organizationId: string | null; tenantId: string | undefined; unitId: string | undefined }) {
  const create = useCreateMaintenanceMutation(organizationId);
  const upload = useAddMaintenanceEvidenceMutation(organizationId);
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [submitted, setSubmitted] = useState(false);
  const [createdRequestId, setCreatedRequestId] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Array<{ id: string; file: File; url: string }>>([]);

  function releaseAttachments() {
    for (const attachment of attachments) URL.revokeObjectURL(attachment.url);
    setAttachments([]);
  }

  function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    const validation = validateMaintenanceMedia(files, attachments.length);
    if (validation) { setMediaError(validation); return; }
    setMediaError(null);
    setAttachments((current) => [...current, ...files.map((file) => ({ id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`, file, url: URL.createObjectURL(file) }))]);
  }

  function removeAttachment(id: string) {
    setAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      return current.filter((attachment) => attachment.id !== id);
    });
    setMediaError(null);
  }

  async function uploadAttachments(requestId: string) {
    if (!attachments.length) return;
    await upload.mutateAsync({ id: requestId, files: attachments.map((attachment) => attachment.file) });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || !unitId) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setMediaError(null);
    try {
      const requestId = createdRequestId ?? (await create.mutateAsync({ unitId, tenantId, title: String(data.get('title')), description: String(data.get('description')), category: data.get('category') as MaintenanceRequest['category'], priority: data.get('priority') as MaintenanceRequest['priority'] }))._id;
      setCreatedRequestId(requestId);
      await uploadAttachments(requestId);
      releaseAttachments();
      setSubmitted(true);
      form.reset();
    } catch {
      if (createdRequestId || create.data?._id) setMediaError('Your maintenance request was created, but its media did not upload. Retry to attach the selected files without creating another request.');
    }
  }

  function change(openValue: boolean) {
    if (!openValue) {
      releaseAttachments();
      setSubmitted(false);
      setCreatedRequestId(null);
      setMediaError(null);
      create.reset();
      upload.reset();
    }
    onOpenChange(openValue);
  }

  const busy = create.isPending || upload.isPending;
  return <Dialog open={open} onOpenChange={change} title="Report an issue" description="Give the operations team enough detail to triage your request." className="max-w-2xl">
    {submitted ? <div className="space-y-5"><Alert tone="success" title="Request sent">Management can now review your description and attached media.</Alert><div className="flex justify-end"><Button onClick={() => change(false)}><Check size={16} /> Done</Button></div></div> :
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <div><Label htmlFor="issue-title">What needs attention?</Label><Input id="issue-title" name="title" required minLength={3} maxLength={160} placeholder="e.g. Kitchen tap is leaking" disabled={Boolean(createdRequestId)} /></div>
        <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="issue-category">Category</Label><Select id="issue-category" name="category" defaultValue="PLUMBING" required disabled={Boolean(createdRequestId)}>{['PLUMBING','ELECTRICAL','STRUCTURAL','SECURITY','CLEANING','APPLIANCE','HVAC','PEST_CONTROL','OTHER'].map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</Select></div><div><Label htmlFor="issue-priority">Priority</Label><Select id="issue-priority" name="priority" defaultValue="MEDIUM" required disabled={Boolean(createdRequestId)}>{['LOW','MEDIUM','HIGH','EMERGENCY'].map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</Select></div></div>
        <div><Label htmlFor="issue-description">What is happening?</Label><Textarea id="issue-description" name="description" required minLength={10} maxLength={2000} placeholder="Describe the location, when it started, and anything the team should know." disabled={Boolean(createdRequestId)} /></div>
        <fieldset>
          <legend className="field-label">Photos and videos <span className="font-normal text-muted-foreground">(optional)</span></legend>
          <input ref={photoInput} className="sr-only" type="file" accept="image/*" capture="environment" onChange={addFiles} />
          <input ref={videoInput} className="sr-only" type="file" accept="video/*" capture="environment" onChange={addFiles} />
          <input ref={galleryInput} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/webm,video/quicktime" multiple onChange={addFiles} />
          <div className="grid grid-cols-3 gap-2">
            <Button type="button" variant="outline" className="h-auto min-h-20 flex-col px-2 py-3" onClick={() => photoInput.current?.click()} disabled={attachments.length >= 5 || busy}><Camera size={18} /><span className="text-xs">Take photo</span></Button>
            <Button type="button" variant="outline" className="h-auto min-h-20 flex-col px-2 py-3" onClick={() => videoInput.current?.click()} disabled={attachments.length >= 5 || busy}><Video size={18} /><span className="text-xs">Record video</span></Button>
            <Button type="button" variant="outline" className="h-auto min-h-20 flex-col px-2 py-3" onClick={() => galleryInput.current?.click()} disabled={attachments.length >= 5 || busy}><ImagePlus size={18} /><span className="text-xs">Add media</span></Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Up to 5 files. Photos: 10 MB each. Videos: 25 MB each.</p>
          {attachments.length > 0 && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{attachments.map((attachment) => <div key={attachment.id} className="relative aspect-video overflow-hidden rounded-md border border-border bg-black">{isVideoMedia(attachment.file) ? <video src={attachment.url} className="h-full w-full object-cover" controls preload="metadata" /> : <img src={attachment.url} alt={attachment.file.name} className="h-full w-full object-cover" />}<button type="button" onClick={() => removeAttachment(attachment.id)} className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-md bg-black/75 text-white hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label={`Remove ${attachment.file.name}`}><Trash2 size={14} /></button><div className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-2 py-1 text-[10px] text-white">{attachment.file.name}</div></div>)}</div>}
        </fieldset>
        <Alert tone="warning" title="Immediate danger">For fire, crime, gas, or medical emergencies, contact local emergency services first.</Alert>
        {createdRequestId && <Alert title="Request saved">Only the selected media will be retried.</Alert>}
        {(create.error || upload.error || mediaError) && <Alert tone="destructive">{mediaError ?? upload.error?.message ?? create.error?.message}</Alert>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => change(false)}>Cancel</Button><Button type="submit" loading={busy} disabled={!tenantId || !unitId}>{createdRequestId ? 'Retry media upload' : attachments.length ? `Send request with ${attachments.length} file${attachments.length === 1 ? '' : 's'}` : 'Send request'}</Button></div>
      </form>}
  </Dialog>;
}

function DocumentsDialog({ open, onOpenChange, organizationId, documents }: { open: boolean; onOpenChange: (open: boolean) => void; organizationId: string | null; documents: DocumentRecord[] }) {
  const signedUrl = useSignedStorageUrlMutation(organizationId); const [openingId, setOpeningId] = useState<string | null>(null); const [accessError, setAccessError] = useState<string | null>(null);
  async function openDocument(document: DocumentRecord) { setOpeningId(document._id); setAccessError(null); try { const provider = document.storageProvider === 'LOCAL' ? 'OTHER' : document.storageProvider; const result = await signedUrl.mutateAsync({ key: document.storageKey, provider }); const url = safeExternalUrl(result.url); if (!url) { setAccessError('The document service returned an invalid access link.'); return; } const target = window.open(url, '_blank', 'noopener,noreferrer'); if (target) target.opener = null; } catch { /* Mutation state renders the safe API error. */ } finally { setOpeningId(null); } }
  return <Dialog open={open} onOpenChange={onOpenChange} title="Your documents" description="Access links are short-lived and generated only after authorization." className="max-w-3xl">{(signedUrl.error || accessError) && <Alert tone="destructive" className="mb-4">{signedUrl.error?.message ?? accessError}</Alert>}<div className="max-h-[58vh] divide-y divide-border overflow-y-auto border-y border-border">{documents.length ? documents.map((document) => <div key={document._id} className="flex items-center gap-3 py-4"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground"><FileText size={17} /></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{document.title}</div><div className="mt-1 text-xs text-muted-foreground">{titleCase(document.category)} · {formatFileSize(document.sizeBytes)} · v{document.version}</div></div><Button variant="outline" size="sm" loading={openingId === document._id} onClick={() => void openDocument(document)}><ExternalLink size={14} /><span className="hidden sm:inline">Open</span></Button></div>) : <CompactEmpty icon={FileText} title="No documents available" description="Only active files authorized for your account appear here." />}</div><div className="mt-5 flex justify-end"><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button></div></Dialog>;
}

function NotificationsDialog({ open, onOpenChange, organizationId, notifications }: { open: boolean; onOpenChange: (open: boolean) => void; organizationId: string | null; notifications: NotificationRecord[] }) {
  const markRead = useNotificationReadMutation(organizationId); const unread = notifications.filter((notification) => notification.status !== 'READ');
  async function markAllRead() { try { for (const notification of unread) await markRead.mutateAsync(notification._id); } catch { /* Mutation state renders the safe API error. */ } }
  return <Dialog open={open} onOpenChange={onOpenChange} title="Notifications" description={`${unread.length} unread update${unread.length === 1 ? '' : 's'} for your account.`} className="max-w-3xl"><div className="mb-4 flex justify-end"><Button variant="outline" size="sm" loading={markRead.isPending} disabled={!unread.length} onClick={() => void markAllRead()}><Check size={14} /> Mark all read</Button></div>{markRead.error && <Alert tone="destructive" className="mb-4">{markRead.error.message}</Alert>}<div className="max-h-[56vh] divide-y divide-border overflow-y-auto border-y border-border">{notifications.length ? notifications.map((notification) => { const isUnread = notification.status !== 'READ'; return <div key={notification._id} className="flex gap-3 py-4"><div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${isUnread ? 'bg-[#eff8ff] text-[#175cd3]' : 'bg-muted text-muted-foreground'}`}><Bell size={16} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{notification.title}</h3><Badge tone={notification.priority === 'URGENT' ? 'red' : notification.priority === 'HIGH' ? 'orange' : 'neutral'}>{titleCase(notification.priority)}</Badge></div><p className="mt-1 text-sm leading-6 text-muted-foreground">{notification.body}</p><div className="mt-2 text-xs text-muted-foreground">{relativeDate(notification.createdAt ?? notification.sentAt)} · {titleCase(notification.channel)}</div></div>{isUnread && <Button variant="ghost" size="sm" loading={markRead.isPending && markRead.variables === notification._id} onClick={() => markRead.mutate(notification._id)} aria-label={`Mark ${notification.title} as read`}><Check size={14} /><span className="hidden sm:inline">Read</span></Button>}</div>; }) : <CompactEmpty icon={Bell} title="No notifications" description="You are all caught up." />}</div><div className="mt-5 flex justify-end"><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button></div></Dialog>;
}

function ContactDialog({ open, onOpenChange, organizationName, phone, email, emergencyPhone, officeHours, onReport }: { open: boolean; onOpenChange: (open: boolean) => void; organizationName: string | undefined; phone: string | undefined; email: string | undefined; emergencyPhone: string | undefined; officeHours: string | undefined; onReport: () => void }) {
  const hasContact = phone || email || emergencyPhone;
  return <Dialog open={open} onOpenChange={onOpenChange} title="Contact management" description={organizationName ?? 'Your property management team'} className="max-w-xl"><div className="space-y-3">{phone && <ContactLink href={`tel:${phone}`} icon={Phone} label="Call management" value={phone} />}{email && <ContactLink href={`mailto:${email}`} icon={Mail} label="Email management" value={email} />}{emergencyPhone && <ContactLink href={`tel:${emergencyPhone}`} icon={AlertTriangle} label="Emergency property line" value={emergencyPhone} tone="urgent" />}{!hasContact && <Alert tone="warning" title="Contact details are not configured">Your landlord or manager needs to add resident contact details for this organization.</Alert>}{officeHours && <div className="flex items-center gap-3 rounded-md border border-border bg-muted p-3 text-sm"><Clock3 className="text-muted-foreground" size={17} /><div><div className="font-semibold">Office hours</div><div className="text-xs text-muted-foreground">{officeHours}</div></div></div>}<div className="rounded-md border border-border p-4"><div className="flex items-center gap-2 text-sm font-semibold"><Wrench size={16} /> Property issue?</div><p className="mt-1 text-xs leading-5 text-muted-foreground">A maintenance request creates a trackable record for the operations team.</p><Button variant="outline" size="sm" className="mt-3" onClick={onReport}>Report an issue</Button></div></div><div className="mt-5 flex justify-end"><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button></div></Dialog>;
}
function ContactLink({ href, icon: Icon, label, value, tone }: { href: string; icon: typeof Phone; label: string; value: string; tone?: 'urgent' }) { return <a href={href} className={`flex items-center gap-3 rounded-md border p-4 transition hover:border-[var(--border-strong)] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${tone === 'urgent' ? 'border-[#fecdca] bg-[#fef3f2]' : 'border-border'}`}><div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card"><Icon size={16} /></div><div className="min-w-0 flex-1"><div className="text-sm font-semibold">{label}</div><div className="truncate text-xs text-muted-foreground">{value}</div></div><ExternalLink size={15} className="text-muted-foreground" /></a>; }

function AccountDialog({ open, onOpenChange, name, phone, email, organizationName, leaseNumber, onLogout }: { open: boolean; onOpenChange: (open: boolean) => void; name: string; phone: string | undefined; email: string | undefined; organizationName: string | undefined; leaseNumber: string | undefined; onLogout: () => Promise<void> }) {
  const [loggingOut, setLoggingOut] = useState(false); async function signOut() { setLoggingOut(true); try { await onLogout(); } finally { setLoggingOut(false); } }
  return <Dialog open={open} onOpenChange={onOpenChange} title="Resident account" description="Your signed-in identity and current tenancy context." className="max-w-xl"><div className="flex items-center gap-4 border-b border-border pb-5"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary)] text-white"><UserRound size={21} /></div><div><div className="font-semibold">{name || 'Resident'}</div><div className="mt-0.5 text-xs text-muted-foreground">Tenant account</div></div></div><dl className="divide-y divide-border">{phone && <AccountRow label="Phone" value={phone} />}{email && <AccountRow label="Email" value={email} />}<AccountRow label="Organization" value={organizationName ?? 'Not available'} /><AccountRow label="Lease" value={leaseNumber ?? 'Not connected'} /></dl><Alert className="mt-4" title="Account changes">Contact management to update verified identity or tenancy details.</Alert><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"><Button variant="destructive" loading={loggingOut} onClick={() => void signOut()}><LogOut size={16} /> Sign out</Button><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button></div></Dialog>;
}

function AccountRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4 py-3 text-sm"><dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 truncate text-right font-medium">{value}</dd></div>; }
function CompactEmpty({ icon: Icon, title, description }: { icon: typeof Bell; title: string; description: string }) { return <div className="flex min-h-36 flex-col items-center justify-center px-5 py-8 text-center"><div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground"><Icon size={17} /></div><div className="mt-3 text-sm font-semibold">{title}</div><p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{description}</p></div>; }
function RowsSkeleton({ count = 2 }: { count?: number }) { return <div className="space-y-4 p-4">{Array.from({ length: count }, (_, index) => <div key={index} className="flex gap-3"><Skeleton className="h-9 w-9 shrink-0" /><div className="flex-1"><Skeleton className="h-3 w-1/3" /><Skeleton className="mt-2 h-3 w-3/4" /></div></div>)}</div>; }
function TenantWorkspaceSkeleton() { return <div className="mt-6 space-y-6"><Skeleton className="h-56 w-full" /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-36" />)}</div><div className="grid gap-6 xl:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div></div>; }
function maintenanceTone(status: MaintenanceRequest['status']): 'neutral' | 'green' | 'orange' | 'red' | 'blue' { if (['CLOSED', 'VERIFIED', 'COMPLETED'].includes(status)) return 'green'; if (status === 'CANCELLED') return 'red'; if (['NEW', 'TRIAGED', 'ASSIGNED'].includes(status)) return 'blue'; return 'orange'; }
function titleCase(value: string): string { return value.toLowerCase().replaceAll('_', ' ').replace(/(^|\s)\S/g, (character) => character.toUpperCase()); }
function formatDate(value?: string, options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }): string { if (!value) return 'Not available'; const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Not available' : new Intl.DateTimeFormat('en-KE', options).format(date); }
function relativeDate(value?: string): string { if (!value) return 'recently'; const date = new Date(value); if (Number.isNaN(date.getTime())) return 'recently'; const days = Math.round((date.getTime() - Date.now()) / 86_400_000); if (days === 0) return 'today'; if (days === -1) return 'yesterday'; if (days > -7 && days < 0) return `${Math.abs(days)} days ago`; return formatDate(value); }
function formatFileSize(bytes: number): string { if (bytes < 1024) return `${bytes} B`; if (bytes < 1_048_576) return `${Math.round(bytes / 1024)} KB`; return `${(bytes / 1_048_576).toFixed(1)} MB`; }
function safeExternalUrl(value: string): string | undefined { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined; } catch { return undefined; } }
