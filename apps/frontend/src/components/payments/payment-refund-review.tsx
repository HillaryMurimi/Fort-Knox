'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Plus, RefreshCw, RotateCcw } from 'lucide-react';
import { Alert, Badge, Button, Dialog, Input, Label, Select, Textarea } from '@/components/ui';
import { useApplyRefundLedgerMutation, usePaymentRefundsQuery, useReconcileRefundMutation, useRequestRefundMutation, useReviewRefundMutation } from '@/hooks/queries/use-finance-queries';
import { useSetupPermission } from '@/hooks/use-setup-permission';
import { DEV_DEMO_MODE } from '@/lib/demo/demo-config';
import type { Payment } from '@/lib/data/resource-types';
import { money } from '@/lib/utils';

function refundTone(status: string): 'green' | 'orange' | 'red' | 'neutral' {
  if (status === 'PROCESSED') return 'green';
  if (status === 'FAILED') return 'red';
  if (status === 'SUBMITTING' || status === 'PENDING' || status === 'PROCESSING') return 'orange';
  return 'neutral';
}

export function PaymentRefundReview({ organizationId, payments }: { organizationId: string | null; payments: Payment[] }) {
  const allowed = useSetupPermission(organizationId, 'financial.manage');
  const canReverse = useSetupPermission(organizationId, 'payment.reverse');
  const refunds = usePaymentRefundsQuery(organizationId, allowed && !DEV_DEMO_MODE);
  const request = useRequestRefundMutation(organizationId);
  const reconcile = useReconcileRefundMutation(organizationId);
  const review = useReviewRefundMutation(organizationId);
  const applyLedger = useApplyRefundLedgerMutation(organizationId);
  const [requestOpen, setRequestOpen] = useState(false);
  const [selectedPaymentId, setSelectedPaymentId] = useState('');
  const [reason, setReason] = useState('');
  const [ledgerPaymentId, setLedgerPaymentId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [reviewPaymentId, setReviewPaymentId] = useState<string | null>(null);
  const [reviewId, setReviewId] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const existingIds = useMemo(() => new Set((refunds.data ?? []).map(refund => refund.paymentId)), [refunds.data]);
  const paymentById = useMemo(() => new Map(payments.map(payment => [payment._id, payment])), [payments]);
  const eligible = payments.filter(payment => payment.status === 'CONFIRMED' && payment.provider === 'PAYSTACK' && !existingIds.has(payment._id));
  const ledgerRefund = (refunds.data ?? []).find(refund => refund.paymentId === ledgerPaymentId);
  const reviewRefund = (refunds.data ?? []).find(refund => refund.paymentId === reviewPaymentId);

  if (!allowed || DEV_DEMO_MODE) return null;

  async function submitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await request.mutateAsync({ paymentId: selectedPaymentId, reason: reason.trim() });
      setRequestOpen(false);
      setSelectedPaymentId('');
      setReason('');
    } catch { /* The mutation error is shown in the dialog. */ }
  }

  async function confirmLedger() {
    if (!ledgerPaymentId || !confirmed) return;
    try {
      await applyLedger.mutateAsync(ledgerPaymentId);
      setLedgerPaymentId(null);
      setConfirmed(false);
    } catch { /* The mutation error is shown in the dialog. */ }
  }

  async function submitReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewPaymentId) return;
    const providerRefundId = reviewRefund?.status === 'SUBMISSION_UNKNOWN' ? Number(reviewId) : undefined;
    try {
      await review.mutateAsync({ paymentId: reviewPaymentId, note: reviewNote.trim(), ...(providerRefundId ? { providerRefundId } : {}) });
      setReviewPaymentId(null);
      setReviewId('');
      setReviewNote('');
    } catch { /* The mutation error is shown in the dialog. */ }
  }

  return <section className="mt-7 border-t border-border pt-6" aria-labelledby="refund-review-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="refund-review-title" className="text-sm font-semibold">Paystack refunds</h2>
        <p className="mt-1 text-xs text-muted-foreground">Provider status and rent-ledger correction are tracked separately.</p>
      </div>
      <Button size="sm" onClick={() => setRequestOpen(true)} disabled={!eligible.length}><Plus size={15} />Request refund</Button>
    </div>
    {refunds.isLoading && <div className="mt-4 text-sm text-muted-foreground">Loading refunds...</div>}
    {refunds.error && <Alert tone="destructive" className="mt-4">{refunds.error.message} <button className="underline" onClick={() => void refunds.refetch()}>Retry</button></Alert>}
    {!refunds.isLoading && !refunds.error && !refunds.data?.length && <p className="mt-4 border-y border-border py-5 text-sm text-muted-foreground">No refund requests yet.</p>}
    {!!refunds.data?.length && <div className="mt-4 divide-y divide-border border-y border-border">
      {refunds.data.map(refund => {
        const payment = paymentById.get(refund.paymentId);
        const canApply = canReverse && refund.status === 'PROCESSED' && !refund.ledgerReversedAt && payment?.status === 'CONFIRMED';
        return <div key={refund._id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{payment?.receiptNumber ?? refund.transactionReference}</span><Badge tone={refundTone(refund.status)}>{refund.status.replaceAll('_', ' ')}</Badge>{refund.ledgerReversedAt && <Badge tone="neutral">Ledger corrected</Badge>}</div>
            <div className="mt-1 break-words text-xs text-muted-foreground">{money(refund.amountMinorUnits / 100)} | Requested {refund.createdAt.slice(0, 10)} | {refund.reason}</div>
            {refund.status === 'SUBMISSION_UNKNOWN' && <p className="mt-1 text-xs text-[var(--destructive)]">Review this request in Paystack before taking further action. Do not submit it again.</p>}
            {refund.status === 'NEEDS_ATTENTION' && <p className="mt-1 text-xs text-muted-foreground">Paystack needs customer bank details. Handle them in Paystack, then check status here.</p>}
            {refund.lastReviewNote && <p className="mt-1 break-words text-xs text-muted-foreground">Last review: {refund.lastReviewNote}</p>}
            {refund.status === 'PROCESSED' && !refund.ledgerReversedAt && <p className="mt-1 text-xs text-muted-foreground">Paystack processed the refund. The rent balance is still unchanged.</p>}
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {(refund.status === 'SUBMISSION_UNKNOWN' || refund.status === 'NEEDS_ATTENTION') && <Button size="sm" variant="outline" onClick={() => { setReviewPaymentId(refund.paymentId); setReviewId(''); setReviewNote(''); }}><ClipboardCheck size={14} />Review</Button>}
            {!!refund.providerRefundId && !refund.ledgerReversedAt && <Button size="sm" variant="outline" onClick={() => reconcile.mutate(refund.paymentId)} disabled={reconcile.isPending} title="Check refund status with Paystack"><RefreshCw size={14} />Check status</Button>}
            {canApply && <Button size="sm" variant="outline" onClick={() => { setLedgerPaymentId(refund.paymentId); setConfirmed(false); }}><RotateCcw size={14} />Correct ledger</Button>}
            {refund.ledgerReversedAt && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><CheckCircle2 size={15} />Done</span>}
          </div>
        </div>;
      })}
    </div>}
    {reconcile.error && <Alert tone="destructive" className="mt-3">{reconcile.error.message}</Alert>}
    <Dialog open={requestOpen} onOpenChange={setRequestOpen} title="Request full refund" description="Paystack may take time to process the request. Rent balances will not change automatically.">
      <form className="space-y-4" onSubmit={event => void submitRequest(event)}>
        <div><Label htmlFor="refund-payment">Payment</Label><Select id="refund-payment" value={selectedPaymentId} onChange={event => setSelectedPaymentId(event.target.value)} required><option value="" disabled>Select a Paystack payment</option>{eligible.map(payment => <option key={payment._id} value={payment._id}>{payment.receiptNumber ?? payment.providerTransactionId ?? payment._id} - {money(payment.amount)}</option>)}</Select></div>
        <div><Label htmlFor="refund-reason">Reason</Label><Textarea id="refund-reason" value={reason} onChange={event => setReason(event.target.value)} minLength={10} maxLength={500} required rows={3} /></div>
        {request.error && <Alert tone="destructive">{request.error.message}</Alert>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setRequestOpen(false)}>Cancel</Button><Button type="submit" disabled={!selectedPaymentId || reason.trim().length < 10} loading={request.isPending}>Submit to Paystack</Button></div>
      </form>
    </Dialog>
    <Dialog open={Boolean(reviewPaymentId)} onOpenChange={open => { if (!open) setReviewPaymentId(null); }} title="Review Paystack refund" description="Check the original transaction in Paystack. This action never sends another refund request.">
      <form className="space-y-4" onSubmit={event => void submitReview(event)}>
        {reviewRefund?.status === 'SUBMISSION_UNKNOWN' && <div><Label htmlFor="review-refund-id">Paystack refund ID</Label><Input id="review-refund-id" inputMode="numeric" pattern="[0-9]+" value={reviewId} onChange={event => setReviewId(event.target.value)} required /><p className="mt-1 text-xs text-muted-foreground">Use the refund ID shown in Paystack for this exact transaction. If no refund exists, leave this request open for investigation.</p></div>}
        {reviewRefund?.status === 'NEEDS_ATTENTION' && <p className="text-sm text-muted-foreground">Complete any requested customer bank details in Paystack. PMCC will fetch the linked refund status; do not enter account details here.</p>}
        <div><Label htmlFor="review-note">Investigation note</Label><Textarea id="review-note" value={reviewNote} onChange={event => setReviewNote(event.target.value)} minLength={10} maxLength={1000} required rows={3} placeholder="Describe what you verified in Paystack, without account details" /></div>
        {review.error && <Alert tone="destructive">{review.error.message}</Alert>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setReviewPaymentId(null)}>Cancel</Button><Button type="submit" loading={review.isPending} disabled={reviewNote.trim().length < 10 || (reviewRefund?.status === 'SUBMISSION_UNKNOWN' && (!/^[0-9]+$/.test(reviewId) || !Number.isSafeInteger(Number(reviewId)) || Number(reviewId) <= 0))}>Verify and record</Button></div>
      </form>
    </Dialog>
    <Dialog open={Boolean(ledgerPaymentId)} onOpenChange={open => { if (!open) { setLedgerPaymentId(null); setConfirmed(false); } }} title="Correct rent ledger" description="This reopens the rent balance for the refunded payment. It does not send another refund.">
      <div className="space-y-4">
        <div className="text-sm">Paystack refund: <b>{ledgerRefund?.status ?? 'Unavailable'}</b></div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1" />I have reviewed the processed refund and want to correct the rent ledger.</label>
        {applyLedger.error && <Alert tone="destructive">{applyLedger.error.message}</Alert>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setLedgerPaymentId(null)}>Cancel</Button><Button onClick={() => void confirmLedger()} disabled={!confirmed || ledgerRefund?.status !== 'PROCESSED'} loading={applyLedger.isPending}>Correct ledger</Button></div>
      </div>
    </Dialog>
  </section>;
}
