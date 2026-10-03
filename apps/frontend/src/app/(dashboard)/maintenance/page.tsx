'use client';
import { useState, type ReactNode } from 'react';
import * as I from '@/components/icons';
import { StatusBadge, PageTitle, Stat, SectionHeader, EmptyState } from '@/components/ui';
import { useOrganization } from '@/hooks/use-organization';
import {
  useMaintenanceQuery,
  useCreateMaintenanceMutation,
  useTriageMaintenanceMutation,
  useApproveMaintenanceMutation,
  useProgressMaintenanceMutation,
} from '@/hooks/queries/use-maintenance-queries';
import { useContractorsQuery, useCreateContractorMutation } from '@/hooks/queries/use-contractor-queries';
import { useExpensesQuery, useCreateExpenseMutation, useExpenseActionMutation } from '@/hooks/queries/use-finance-queries';
import type { Contractor, Expense, MaintenanceRequest } from '@/lib/data/resource-types';
import type { CreateMaintenanceInput } from '@/lib/data/maintenance';
import type { ExpenseInput } from '@/lib/data/finance';
import type { ContractorInput } from '@/lib/data/contractors';

type MaintenanceCategory = NonNullable<CreateMaintenanceInput['category']>;
type MaintenancePriority = NonNullable<CreateMaintenanceInput['priority']>;
type ExpenseCategory = NonNullable<ExpenseInput['category']>;



const money = (n: number | undefined, c = 'KES') => (n == null ? '—' : `${c} ${n.toLocaleString()}`);

export default function Maintenance() {
  const { activeOrganizationId: org } = useOrganization();
  const [tab, setTab] = useState<'maintenance' | 'contractors' | 'expenses'>('maintenance');
  const [q, setQ] = useState('');
  const m = useMaintenanceQuery(org), c = useContractorsQuery(org), e = useExpensesQuery(org);
  const createM = useCreateMaintenanceMutation(org), createC = useCreateContractorMutation(org), createE = useCreateExpenseMutation(org);
  const triage = useTriageMaintenanceMutation(org), approve = useApproveMaintenanceMutation(org), progress = useProgressMaintenanceMutation(org);
  const expenseAction = useExpenseActionMutation(org);
  const [modal, setModal] = useState<'maintenance' | 'contractor' | 'expense' | null>(null);
  const maintenance = (m.data ?? []).filter((x) =>
    `${x.title} ${x.description} ${x.category} ${x.status}`.toLowerCase().includes(q.toLowerCase()),
  );
  const open = maintenance.filter((x) => !['COMPLETED', 'VERIFIED', 'CLOSED', 'CANCELLED'].includes(x.status)).length;
  const urgent = maintenance.filter((x) => x.priority === 'EMERGENCY' || x.priority === 'HIGH').length;
  const cost = maintenance.reduce((a, x) => a + (x.actualAmount ?? x.approvedAmount ?? x.quoteAmount ?? 0), 0);
  const pendingApproval = maintenance.filter((x) => x.status === 'APPROVAL_REQUIRED').length;
  const expenseTotal = (e.data ?? []).reduce((a, x) => a + x.amount, 0);
  const paidExpense = (e.data ?? []).filter((x) => x.status === 'PAID').reduce((a, x) => a + x.amount, 0);

  return (
    <div>
      <PageTitle
        eyebrow="Operations"
        title="Maintenance Command Center"
        description="Control repairs, approvals, contractors and operational spend without losing the financial audit trail."
        action={
          <button
            className="btn-primary"
            onClick={() =>
              setModal(tab === 'contractors' ? 'contractor' : tab === 'expenses' ? 'expense' : 'maintenance')
            }
          >
            <I.Plus size={15} />
            {tab === 'contractors' ? 'Add contractor' : tab === 'expenses' ? 'Record expense' : 'New request'}
          </button>
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="Open work" value={String(open)} sub="Active maintenance" icon={I.Wrench} />
        <Stat label="Urgent" value={String(urgent)} sub="Emergency + high priority" icon={I.AlertTriangle} />
        <Stat label="Operational spend" value={money(cost)} sub="Quoted / approved / actual" icon={I.Wallet} />
        <Stat label="Awaiting approval" value={String(pendingApproval)} sub="Financial control gate" icon={I.LockKeyhole} />
      </div>
      <div className="flex gap-2 mb-5">
        <button className={`px-4 py-2 rounded-xl text-sm font-medium ${tab === 'maintenance' ? 'bg-[#101828] text-white' : 'bg-card border border-border'}`} onClick={() => setTab('maintenance')}>Maintenance</button>
        <button className={`px-4 py-2 rounded-xl text-sm font-medium ${tab === 'contractors' ? 'bg-[#101828] text-white' : 'bg-card border border-border'}`} onClick={() => setTab('contractors')}>Contractors</button>
        <button className={`px-4 py-2 rounded-xl text-sm font-medium ${tab === 'expenses' ? 'bg-[#101828] text-white' : 'bg-card border border-border'}`} onClick={() => setTab('expenses')}>Expenses</button>
      </div>
      {tab === 'maintenance' && (
        <section className="card overflow-hidden">
          <div className="p-4 border-b border-border flex gap-3">
            <div className="flex-1 max-w-md h-10 bg-muted rounded-xl flex items-center px-3 gap-2">
              <I.Search size={16} />
              <input value={q} onChange={(x) => setQ(x.target.value)} className="outline-none bg-transparent w-full text-sm" placeholder="Search requests..." />
            </div>
          </div>
          {m.isLoading ? (
            <div className="p-10 text-sm text-muted-foreground">Loading maintenance…</div>
          ) : maintenance.length ? (
            <div className="divide-y divide-border">
              {maintenance.map((x) => (
                <MaintenanceRow
                  key={x._id}
                  x={x}
                  onTriage={() => triage.mutate({ id: x._id, input: {} })}
                  onApprove={() => {
                    if (x.quoteAmount == null) return;
                    approve.mutate({ id: x._id, input: { approvedAmount: x.quoteAmount } });
                  }}
                  onProgress={() => {
                    const amount = x.approvedAmount ?? x.quoteAmount;
                    progress.mutate({
                      id: x._id,
                      input: {
                        status: 'COMPLETED',
                        ...(amount != null ? { actualAmount: amount } : {}),
                      },
                    });
                  }}
                />
              ))}
            </div>
          ) : (
            <EmptyState icon={I.Wrench} title="No maintenance requests" description="Create a request to start the controlled maintenance workflow." />
          )}
        </section>
      )}
      {tab === 'contractors' && <Contractors data={c.data ?? []} loading={c.isLoading} />}
      {tab === 'expenses' && (
        <Expenses
          data={e.data ?? []}
          total={expenseTotal}
          paid={paidExpense}
          onAction={(id, action) => expenseAction.mutate({ id, action })}
        />
      )}
      {modal === 'maintenance' && (
        <MaintenanceModal onClose={() => setModal(null)} busy={createM.isPending} onSubmit={(v) => createM.mutate(v, { onSuccess: () => setModal(null) })} />
      )}
      {modal === 'contractor' && (
        <ContractorModal onClose={() => setModal(null)} busy={createC.isPending} onSubmit={(v) => createC.mutate(v, { onSuccess: () => setModal(null) })} />
      )}
      {modal === 'expense' && (
        <ExpenseModal onClose={() => setModal(null)} busy={createE.isPending} onSubmit={(v) => createE.mutate(v, { onSuccess: () => setModal(null) })} />
      )}
    </div>
  );
}

function MaintenanceRow({ x, onTriage, onApprove, onProgress }: { x: MaintenanceRequest; onTriage: () => void; onApprove: () => void; onProgress: () => void }) {
  return (
    <div className="px-5 py-4 flex flex-wrap items-center gap-4">
      <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center"><I.Wrench size={17} /></div>
      <div className="flex-1 min-w-[220px]">
        <div className="font-medium text-sm">{x.title}</div>
        <div className="text-xs text-muted-foreground mt-1">{x.category} · Unit {x.unitId} · {x.priority}</div>
      </div>
      <StatusBadge status={x.status} domain="maintenance">{x.status.replaceAll('_', ' ')}</StatusBadge>
      <div className="text-sm font-semibold">{money(x.actualAmount ?? x.approvedAmount ?? x.quoteAmount)}</div>
      <div className="flex gap-2">
        {x.status === 'NEW' && <button className="btn-secondary" onClick={onTriage}>Triage</button>}
        {x.status === 'APPROVAL_REQUIRED' && <button className="btn-secondary" onClick={onApprove}>Approve</button>}
        {x.status === 'APPROVED' || x.status === 'IN_PROGRESS' ? <button className="btn-secondary" onClick={onProgress}>Complete</button> : null}
      </div>
    </div>
  );
}

function Contractors({ data, loading }: { data: Contractor[]; loading: boolean }) {
  return (
    <section className="card overflow-hidden">
      <SectionHeader title="Contractor register" />
      <div className="divide-y divide-border">
        {loading ? (
          <div className="p-8 text-sm text-muted-foreground">Loading contractors…</div>
        ) : data.length ? (
          data.map((x) => (
            <div key={x._id} className="px-5 py-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center"><I.UserRound size={17} /></div>
              <div className="flex-1">
                <div className="font-medium text-sm">{x.name}</div>
                <div className="text-xs text-muted-foreground">{x.trade} · {x.phone ?? 'No phone'}</div>
              </div>
              <StatusBadge status={x.status} domain="contractor">{x.status}</StatusBadge>
              <div className="text-sm">Rating {x.rating.toFixed?.(1) ?? x.rating}</div>
            </div>
          ))
        ) : (
          <div className="p-10"><EmptyState icon={I.Users} title="No contractors" description="Register vendors before assigning maintenance work." /></div>
        )}
      </div>
    </section>
  );
}

function Expenses({ data, total, paid, onAction }: { data: Expense[]; total: number; paid: number; onAction: (id: string, a: 'approve' | 'pay' | 'reject') => void }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <Stat label="Recorded spend" value={money(total)} sub="All operational expenses" icon={I.Wallet} />
        <Stat label="Paid spend" value={money(paid)} sub="Posted as paid" icon={I.CircleDollarSign} />
      </div>
      <section className="card overflow-hidden">
        <SectionHeader title="Operational expense ledger" />
        <div className="divide-y divide-border">
          {data.length ? (
            data.map((x) => (
              <div key={x._id} className="px-5 py-4 flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[220px]">
                  <div className="font-medium text-sm">{x.description}</div>
                  <div className="text-xs text-muted-foreground">{x.category} · {x.sourceType} · {x.propertyId}</div>
                </div>
                <StatusBadge status={x.status} domain="expense">{x.status}</StatusBadge>
                <div className="font-semibold">{money(x.amount, x.currency)}</div>
                <div className="flex gap-2">
                  {x.status === 'SUBMITTED' && <button className="btn-secondary" onClick={() => onAction(x._id, 'approve')}>Approve</button>}
                  {x.status === 'APPROVED' && <button className="btn-secondary" onClick={() => onAction(x._id, 'pay')}>Pay</button>}
                </div>
              </div>
            ))
          ) : (
            <div className="p-10"><EmptyState icon={I.Receipt} title="No expenses" description="Maintenance-linked and manually recorded expenses will appear here." /></div>
          )}
        </div>
      </section>
    </>
  );
}

function Modal({ title, children, onClose, busy }: { title: string; children: ReactNode; onClose: () => void; busy: boolean }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-panel max-w-xl w-full">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose}><I.X size={18} /></button>
        </div>
        {children}
        <button className="btn-primary w-full mt-5" disabled={busy} form="phase7-form">{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

function MaintenanceModal({ onClose, onSubmit, busy }: { onClose: () => void; onSubmit: (v: CreateMaintenanceInput) => void; busy: boolean }) {
  const [v, setV] = useState<CreateMaintenanceInput>({ unitId: '', title: '', description: '', category: 'PLUMBING', priority: 'MEDIUM' });
  return (
    <Modal title="Create maintenance request" onClose={onClose} busy={busy}>
      <form id="phase7-form" onSubmit={(e) => { e.preventDefault(); onSubmit(v); }} className="space-y-3">
        <input className="input" placeholder="Unit ID" required value={v.unitId} onChange={(e) => setV({ ...v, unitId: e.target.value })} />
        <input className="input" placeholder="Title" required value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
        <textarea className="input min-h-24" placeholder="Description" required value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
        <select
          className="input"
          value={v.category}
          onChange={(e) => setV({ ...v, category: e.target.value as MaintenanceCategory })}
        >
          {['PLUMBING', 'ELECTRICAL', 'STRUCTURAL', 'SECURITY', 'CLEANING', 'APPLIANCE', 'HVAC', 'PEST_CONTROL', 'OTHER'].map((x) => <option key={x}>{x}</option>)}
        </select>
        <select
          className="input"
          value={v.priority}
          onChange={(e) => setV({ ...v, priority: e.target.value as MaintenancePriority })}
        >
          {['EMERGENCY', 'HIGH', 'MEDIUM', 'LOW'].map((x) => <option key={x}>{x}</option>)}
        </select>
      </form>
    </Modal>
  );
}

function ContractorModal({ onClose, onSubmit, busy }: { onClose: () => void; onSubmit: (v: ContractorInput) => void; busy: boolean }) {
  const [v, setV] = useState<ContractorInput>({ name: '', trade: '', phone: '', email: '' });
  return (
    <Modal title="Register contractor" onClose={onClose} busy={busy}>
      <form id="phase7-form" onSubmit={(e) => { e.preventDefault(); onSubmit(v); }} className="space-y-3">
        <input className="input" placeholder="Name" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <input className="input" placeholder="Trade" required value={v.trade} onChange={(e) => setV({ ...v, trade: e.target.value })} />
        <input className="input" placeholder="Phone" value={v.phone ?? ''} onChange={(e) => setV({ ...v, phone: e.target.value })} />
        <input className="input" placeholder="Email" value={v.email ?? ''} onChange={(e) => setV({ ...v, email: e.target.value })} />
      </form>
    </Modal>
  );
}

function ExpenseModal({ onClose, onSubmit, busy }: { onClose: () => void; onSubmit: (v: ExpenseInput) => void; busy: boolean }) {
  const [v, setV] = useState<ExpenseInput>({ propertyId: '', description: '', amount: 0, category: 'MAINTENANCE', incurredAt: new Date().toISOString().slice(0, 10) });
  return (
    <Modal title="Record operational expense" onClose={onClose} busy={busy}>
      <form id="phase7-form" onSubmit={(e) => { e.preventDefault(); onSubmit(v); }} className="space-y-3">
        <input className="input" placeholder="Property ID" required value={v.propertyId} onChange={(e) => setV({ ...v, propertyId: e.target.value })} />
        <input className="input" placeholder="Description" required value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
        <input className="input" type="number" min="0" placeholder="Amount" required value={v.amount || ''} onChange={(e) => setV({ ...v, amount: Number(e.target.value) })} />
        <select
          className="input"
          value={v.category}
          onChange={(e) => setV({ ...v, category: e.target.value as ExpenseCategory })}
        >
          {['MAINTENANCE', 'UTILITIES', 'SECURITY', 'CLEANING', 'INSURANCE', 'TAX', 'STAFF', 'MANAGEMENT', 'SUPPLIES', 'LEGAL', 'MARKETING', 'OTHER'].map((x) => <option key={x}>{x}</option>)}
        </select>
        <input className="input" type="date" required value={v.incurredAt} onChange={(e) => setV({ ...v, incurredAt: e.target.value })} />
      </form>
    </Modal>
  );
}