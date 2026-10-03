'use client';

import { useMemo, useState } from 'react';
import { StatusBadge, PageTitle, Stat, SectionHeader, EmptyState } from '@/components/ui';
import * as I from '@/components/icons';
import { money } from '@/lib/utils';
import { useOrganization } from '@/context/organization-context';
import {
  useArrearsQuery,
  useConfirmPaymentMutation,
  useCreatePaymentMutation,
  useFinancialReportQuery,
  useGenerateRentMutation,
  useInitiateProviderPaymentMutation,
  usePaymentsQuery,
  useRentChargesQuery,
  useTenanciesQuery,
} from '@/hooks/queries';
import type { Payment, RentCharge } from '@/lib/data/resource-types';
import { PaymentDestinations } from '@/components/payments/payment-destinations';
import { PaymentRefundReview } from '@/components/payments/payment-refund-review';

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const monthStart = (date = new Date()) => new Date(date.getFullYear(), date.getMonth(), 1);
const monthEnd = (date = new Date()) => new Date(date.getFullYear(), date.getMonth() + 1, 0);



const shortId = (value: string) =>
  value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;

export default function FinancePage() {
  const { activeOrganizationId } = useOrganization();
  const [from, setFrom] = useState(isoDate(monthStart()));
  const [to, setTo] = useState(isoDate(monthEnd()));
  const [showPayment, setShowPayment] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [confirming, setConfirming] = useState<Payment | null>(null);
  const [collecting, setCollecting] = useState<Payment | null>(null);
  const [providerMessage, setProviderMessage] = useState<string | null>(null);

  const rent = useRentChargesQuery(activeOrganizationId);
  const payments = usePaymentsQuery(activeOrganizationId);
  const arrears = useArrearsQuery(activeOrganizationId);
  const tenancies = useTenanciesQuery(activeOrganizationId);
  const report = useFinancialReportQuery(activeOrganizationId, { from, to });
  const createPayment = useCreatePaymentMutation(activeOrganizationId);
  const confirmPayment = useConfirmPaymentMutation(activeOrganizationId);
  const generateRent = useGenerateRentMutation(activeOrganizationId);
  const initiatePayment = useInitiateProviderPaymentMutation(activeOrganizationId);

  const openCharges = useMemo(
    () =>
      (rent.data ?? []).filter((x) =>
        ['OPEN', 'PARTIALLY_PAID', 'OVERDUE'].includes(x.status),
      ),
    [rent.data],
  );
  const currentPayments = useMemo(
    () =>
      (payments.data ?? [])
        .slice()
        .sort((a, b) => (b.paidAt ?? '').localeCompare(a.paidAt ?? ''))
        .slice(0, 12),
    [payments.data],
  );
  const currentArrears = useMemo(
    () =>
      (arrears.data ?? []).filter(
        (x) => x.status !== 'RESOLVED' && x.status !== 'WRITTEN_OFF',
      ),
    [arrears.data],
  );

  const collectionRate = report.data?.collectionRate ?? 0;
  const outstanding =
    report.data?.outstanding ?? openCharges.reduce((sum, x) => sum + x.balanceAmount, 0);
  const billed =
    report.data?.totalBilled ?? (rent.data ?? []).reduce((sum, x) => sum + x.totalAmount, 0);
  const collected =
    report.data?.totalCollected ?? (rent.data ?? []).reduce((sum, x) => sum + x.paidAmount, 0);
  const expenses = report.data?.totalExpenses ?? 0;

  return (
    <>
      <PageTitle
        eyebrow="Money"
        title="Finance"
        description="Control rent charges, collections, allocations, arrears and financial performance."
        action={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setShowGenerate(true)}>
              <I.CalendarDays size={15} />
              Generate rent
            </button>
            <button className="btn-primary" onClick={() => setShowPayment(true)}>
              <I.Plus size={15} />
              Record payment
            </button>
          </div>
        }
      />

      {providerMessage && (
        <div role="status" className="mb-4 border border-[#b7e4c7] bg-[#f0fff4] px-4 py-3 text-sm text-[#176b3a]">
          {providerMessage}
        </div>
      )}

      <PaymentDestinations organizationId={activeOrganizationId} />
      <PaymentRefundReview organizationId={activeOrganizationId} payments={payments.data ?? []} />

      <div className="flex flex-wrap items-end gap-3 mb-5 card p-4">
        <div>
          <label className="field-label">Report from</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Report to</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="text-xs text-muted-foreground pb-2">
          Reporting follows the active organization and the Phase 19 financial-report contract.
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <Stat
          label="Rent billed"
          value={money(billed)}
          sub={`${report.data?.activeTenancyCount ?? tenancies.data?.filter((t) => t.status === 'ACTIVE').length ?? 0} active tenancies`}
          icon={I.Receipt}
        />
        <Stat
          label="Collected"
          value={money(collected)}
          sub={`${collectionRate.toFixed(1)}% collection rate`}
          trend="up"
          icon={I.Wallet}
        />
        <Stat
          label="Outstanding"
          value={money(outstanding)}
          sub={`${report.data?.arrearsCount ?? currentArrears.length} arrears cases`}
          trend="down"
          icon={I.CircleDollarSign}
        />
        <Stat
          label="Expenses"
          value={money(expenses)}
          sub="Selected reporting period"
          icon={I.CreditCard}
        />
        <Stat
          label="Cash P&L"
          value={money(report.data?.cashPnl ?? collected - expenses)}
          sub="Collected less expenses"
          icon={I.BarChart3}
        />
      </div>

      <div className="grid xl:grid-cols-[1.45fr_.9fr] gap-6 mt-6">
        <section className="card p-5">
          <SectionHeader
            title="Rent charges"
            action={
              <span className="text-xs text-muted-foreground">{openCharges.length} outstanding</span>
            }
          />
          {rent.isLoading ? (
            <div className="py-10 text-sm text-muted-foreground">Loading rent ledger…</div>
          ) : openCharges.length === 0 ? (
            <EmptyState
              icon={I.Receipt}
              title="No outstanding rent charges"
              description="The live organization rent ledger currently has no open, partially paid or overdue charges."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="pb-3">Tenancy</th>
                    <th className="pb-3">Due</th>
                    <th className="pb-3">Billed</th>
                    <th className="pb-3">Balance</th>
                    <th className="pb-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {openCharges.map((charge) => (
                    <tr key={charge._id} className="border-t border-border">
                      <td className="py-3">
                        <div className="font-medium">{shortId(charge.tenancyId)}</div>
                        <div className="text-[11px] text-muted-foreground">
                          Unit {shortId(charge.unitId)}
                        </div>
                      </td>
                      <td className="py-3">{charge.dueDate.slice(0, 10)}</td>
                      <td className="py-3">{money(charge.totalAmount)}</td>
                      <td className="py-3 font-semibold">{money(charge.balanceAmount)}</td>
                      <td className="py-3">
                        <StatusBadge status={charge.status} domain="rent">{charge.status}</StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card p-5">
          <SectionHeader
            title="Arrears"
            action={
              <StatusBadge domain="alert" status={currentArrears.length ? 'OVERDUE' : 'HEALTHY'}>
                {currentArrears.length} active
              </StatusBadge>
            }
          />
          {currentArrears.length === 0 ? (
            <EmptyState
              icon={I.CircleDollarSign}
              title="No active arrears"
              description="There are currently no unresolved arrears cases in the active organization."
            />
          ) : (
            <div className="space-y-3">
              {currentArrears.slice(0, 8).map((item) => (
                <div key={item._id} className="rounded-xl border border-border p-3">
                  <div className="flex justify-between gap-3">
                    <div>
                      <div className="font-medium text-sm">Tenant {shortId(item.tenantId)}</div>
                      <div className="text-[11px] text-muted-foreground">
                        Unit {shortId(item.unitId)}
                      </div>
                    </div>
                    <StatusBadge status={item.status} domain="alert">{item.status}</StatusBadge>
                  </div>
                  <div className="metric font-semibold mt-3">
                    {money(item.amountOutstanding)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid xl:grid-cols-[1.4fr_.9fr] gap-6 mt-6">
        <section className="card p-5">
          <SectionHeader
            title="Payments & allocation"
            action={
              <span className="text-xs text-muted-foreground">
                {payments.data?.length ?? 0} recorded
              </span>
            }
          />
          {currentPayments.length === 0 ? (
            <EmptyState
              icon={I.Wallet}
              title="No payments recorded"
              description="Record a payment to begin the collection ledger. Confirmed payments can be allocated against outstanding rent charges."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="pb-3">Receipt</th>
                    <th className="pb-3">Method</th>
                    <th className="pb-3">Amount</th>
                    <th className="pb-3">Date</th>
                    <th className="pb-3">Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {currentPayments.map((payment) => (
                    <tr key={payment._id} className="border-t border-border">
                      <td className="py-3 font-medium">
                        {payment.receiptNumber ?? shortId(payment._id)}
                      </td>
                      <td className="py-3">{payment.method}</td>
                      <td className="py-3 font-semibold">{money(payment.amount)}</td>
                      <td className="py-3">{payment.paidAt?.slice(0, 10) ?? '—'}</td>
                      <td className="py-3">
                        <StatusBadge status={payment.status} domain="payment">{payment.status}</StatusBadge>
                      </td>
                      <td className="py-3 text-right">
                        {payment.status === 'PENDING' && !payment.providerTransactionId && (
                          <div className="flex justify-end gap-2">
                            <button className="btn-secondary" onClick={() => setCollecting(payment)}>
                              <I.CreditCard size={14} />
                              Collect
                            </button>
                            <button className="btn-secondary" onClick={() => setConfirming(payment)}>
                              Confirm & allocate
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card p-5">
          <SectionHeader title="Financial report" />
          <div className="space-y-3 text-sm">
            {report.data ? (
              <>
                {[
                  ['Total billed', report.data.totalBilled],
                  ['Service charges', report.data.serviceChargesBilled],
                  ['Collected', report.data.totalCollected],
                  ['Outstanding', report.data.outstanding],
                  ['Accrual P&L', report.data.accrualPnl],
                  ['Cash P&L', report.data.cashPnl],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="flex justify-between border-b border-border pb-2"
                  >
                    <span className="text-muted-foreground">{label}</span>
                    <b>{money(Number(value))}</b>
                  </div>
                ))}
              </>
            ) : (
              <div className="text-sm text-muted-foreground">
                {report.isLoading ? 'Loading financial report…' : 'Select a valid reporting period.'}
              </div>
            )}
          </div>
        </section>
      </div>

      {showPayment && (
        <PaymentModal
          tenancies={tenancies.data ?? []}
          submitting={createPayment.isPending}
          onClose={() => setShowPayment(false)}
          onSubmit={async (input) => {
            await createPayment.mutateAsync(input);
            setShowPayment(false);
          }}
        />
      )}
      {showGenerate && (
        <GenerateRentModal
          submitting={generateRent.isPending}
          onClose={() => setShowGenerate(false)}
          onSubmit={async (input) => {
            await generateRent.mutateAsync(input);
            setShowGenerate(false);
          }}
        />
      )}
      {confirming && (
        <AllocationModal
          payment={confirming}
          charges={openCharges}
          submitting={confirmPayment.isPending}
          onClose={() => setConfirming(null)}
          onSubmit={async (allocation) => {
            await confirmPayment.mutateAsync({
              id: confirming._id,
              ...(allocation.allocations.length ? { allocation } : {}),
            });
            setConfirming(null);
          }}
        />
      )}
      {collecting && (
        <ProviderCollectionModal
          payment={collecting}
          submitting={initiatePayment.isPending}
          onClose={() => setCollecting(null)}
          onSubmit={async (input) => {
            const result = await initiatePayment.mutateAsync({ paymentId: collecting._id, input });
            setCollecting(null);
            if (result.checkoutUrl) {
              window.location.assign(result.checkoutUrl);
              return;
            }
            setProviderMessage(result.customerMessage ?? 'Payment request sent to the provider.');
          }}
        />
      )}
    </>
  );
}

function ProviderCollectionModal({
  payment,
  submitting,
  onClose,
  onSubmit,
}: {
  payment: Payment;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (input: { provider: 'MPESA' | 'PAYSTACK'; phone?: string; email?: string }) => Promise<void>;
}) {
  const [provider, setProvider] = useState<'MPESA' | 'PAYSTACK'>(
    payment.method === 'MPESA' ? 'MPESA' : 'PAYSTACK',
  );
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  return (
    <Modal title={`Collect ${money(payment.amount)}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit({
            provider,
            ...(provider === 'MPESA' && phone ? { phone } : {}),
            ...(provider === 'PAYSTACK' && email ? { email } : {}),
          });
        }}
      >
        <div>
          <label className="field-label">Payment provider</label>
          <select value={provider} onChange={(event) => setProvider(event.target.value as 'MPESA' | 'PAYSTACK')}>
            <option value="MPESA">M-Pesa</option>
            <option value="PAYSTACK">Paystack</option>
          </select>
        </div>
        {provider === 'MPESA' ? (
          <div>
            <label className="field-label">Payer phone override</label>
            <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Use tenant phone" />
          </div>
        ) : (
          <div>
            <label className="field-label">Payer email override</label>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Use tenant email" />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={submitting}>
            {submitting ? 'Connecting…' : provider === 'MPESA' ? 'Send M-Pesa request' : 'Open Paystack checkout'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal-panel max-w-xl w-full">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="btn-secondary" onClick={onClose}>
            <I.X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PaymentModal({
  tenancies,
  submitting,
  onClose,
  onSubmit,
}: {
  tenancies: { _id: string }[];
  submitting: boolean;
  onClose: () => void;
  onSubmit: (input: {
    tenancyId: string;
    amount: number;
    method: Payment["method"];
    currency?: string;
    receiptNumber?: string;
    paidAt?: string;
    notes?: string;
  }) => Promise<void>;
}) {
  const [tenancyId, setTenancyId] = useState(tenancies[0]?._id ?? "");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Payment["method"]>("MPESA");
  const [receiptNumber, setReceiptNumber] = useState("");

  return (
    <Modal title="Record payment" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit({
            tenancyId,
            amount: Number(amount),
            method,
            ...(receiptNumber ? { receiptNumber } : {}),
            paidAt: new Date().toISOString(),
          });
        }}
      >
        <div>
          <label className="field-label">Tenancy ID</label>
          <select
            value={tenancyId}
            onChange={(e) => setTenancyId(e.target.value)}
            required
          >
            <option value="">Select tenancy</option>
            {tenancies.map((t) => (
              <option key={t._id} value={t._id}>
                {shortId(t._id)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Amount</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="field-label">Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as Payment["method"])}
            >
              {["MPESA", "BANK_TRANSFER", "CARD", "CASH", "CHEQUE", "OTHER"].map(
                (x) => (
                  <option key={x}>{x}</option>
                ),
              )}
            </select>
          </div>
        </div>
        <div>
          <label className="field-label">Receipt number</label>
          <input
            value={receiptNumber}
            onChange={(e) => setReceiptNumber(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={submitting}>
            {submitting ? "Recording…" : "Record payment"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function GenerateRentModal({
  submitting,
  onClose,
  onSubmit,
}: {
  submitting: boolean;
  onClose: () => void;
  onSubmit: (input: {
    periodStart: string;
    periodEnd: string;
    dueDate: string;
  }) => Promise<void>;
}) {
  const start = isoDate(monthStart());
  const [periodStart, setPeriodStart] = useState(start);
  const [periodEnd, setPeriodEnd] = useState(isoDate(monthEnd()));
  const [dueDate, setDueDate] = useState(start);

  return (
    <Modal title="Generate rent charges" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit({ periodStart, periodEnd, dueDate });
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Period start</label>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="field-label">Period end</label>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              required
            />
          </div>
        </div>
        <div>
          <label className="field-label">Due date</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            required
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Generation is delegated to the backend, which enforces tenancy eligibility and
          idempotency.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={submitting}>
            {submitting ? 'Generating…' : 'Generate charges'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AllocationModal({
  payment,
  charges,
  submitting,
  onClose,
  onSubmit,
}: {
  payment: Payment;
  charges: RentCharge[];
  submitting: boolean;
  onClose: () => void;
  onSubmit: (input: {
    allocations: Array<{ rentChargeId: string; amount: number }>;
  }) => Promise<void>;
}) {
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const total = Object.values(allocations).reduce((sum, value) => sum + Number(value || 0), 0);
  const remaining = payment.amount - total;

  return (
    <Modal title="Confirm & allocate payment" onClose={onClose}>
      <div className="mb-4 rounded-xl bg-muted p-3 text-sm">
        <div className="flex justify-between">
          <span>Payment</span>
          <b>{money(payment.amount)}</b>
        </div>
        <div className="flex justify-between mt-1">
          <span>Allocated</span>
          <b>{money(total)}</b>
        </div>
        <div className="flex justify-between mt-1">
          <span>Remaining</span>
          <b>{money(remaining)}</b>
        </div>
      </div>
      <div className="space-y-2 max-h-72 overflow-auto">
        {charges.map((charge) => (
          <div key={charge._id} className="border border-border rounded-xl p-3">
            <div className="flex justify-between text-sm">
              <span>{shortId(charge._id)}</span>
              <span>Balance {money(charge.balanceAmount)}</span>
            </div>
            <input
              className="mt-2"
              type="number"
              min="0"
              max={Math.min(
                charge.balanceAmount,
                Math.max(0, remaining + Number(allocations[charge._id] || 0)),
              )}
              step="0.01"
              value={allocations[charge._id] ?? ''}
              onChange={(e) =>
                setAllocations((current) => ({
                  ...current,
                  [charge._id]: e.target.value,
                }))
              }
              placeholder="Allocation amount"
            />
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        Leave allocations empty to let the backend apply its provider/payment allocation rules.
        Any explicit allocations must not exceed the payment amount or charge balances.
      </p>
      <div className="flex justify-end gap-2 mt-5">
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn-primary"
          disabled={submitting || remaining < 0}
          onClick={() =>
            void onSubmit({
              allocations: Object.entries(allocations)
                .filter(([, value]) => Number(value) > 0)
                .map(([rentChargeId, value]) => ({
                  rentChargeId,
                  amount: Number(value),
                })),
            })
          }
        >
          {submitting ? 'Confirming…' : 'Confirm payment'}
        </button>
      </div>
    </Modal>
  );
}
