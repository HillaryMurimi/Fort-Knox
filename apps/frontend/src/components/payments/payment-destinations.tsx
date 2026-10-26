'use client';

import { useState, type FormEvent } from 'react';
import { Bitcoin, Building2, Landmark, Plus, RefreshCw, Smartphone } from 'lucide-react';
import { StatusBadge, Alert, Button, Card, Dialog, Input, Label, Select } from '@/components/ui';
import {
  useCreatePaymentDestinationMutation,
  useDisablePaymentDestinationMutation,
  usePaymentDestinationsQuery,
  useRefreshPaymentDestinationMutation,
} from '@/hooks/queries/use-finance-queries';
import { useSetupPermission } from '@/hooks/use-setup-permission';
import type { PaymentDestinationInput } from '@/lib/data/finance';

export function PaymentDestinations({ organizationId }: { organizationId: string | null }) {
  const allowed = useSetupPermission(organizationId ?? '', 'organization.settings.manage');
  const query = usePaymentDestinationsQuery(organizationId, allowed);
  const create = useCreatePaymentDestinationMutation(organizationId);
  const disable = useDisablePaymentDestinationMutation(organizationId);
  const refresh = useRefreshPaymentDestinationMutation(organizationId);
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<'PAYSTACK' | 'MPESA' | 'CRYPTO'>('PAYSTACK');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    let input: PaymentDestinationInput;
    if (provider === 'PAYSTACK') input = {
      provider, label: String(data.get('label')), businessName: String(data.get('businessName')),
      bankCode: String(data.get('bankCode')), accountNumber: String(data.get('accountNumber')),
      currency: 'KES', country: 'KE', isDefault: true, percentageCharge: 0,
    };
    else if (provider === 'MPESA') {
      const accountReference = String(data.get('accountReference') || '');
      input = { provider, label: String(data.get('label')), shortCode: String(data.get('shortCode')),
        currency: 'KES', country: 'KE', isDefault: true, ...(accountReference ? { accountReference } : {}) };
    } else input = {
      provider, label: String(data.get('label')), asset: data.get('asset') as 'USDC' | 'USDT' | 'BTC' | 'ETH',
      network: data.get('network') as 'BASE' | 'ETHEREUM' | 'POLYGON' | 'BITCOIN',
      walletAddress: String(data.get('walletAddress')), currency: String(data.get('asset')), country: 'KE', isDefault: true,
    };
    try { await create.mutateAsync(input); setOpen(false); } catch { /* Mutation error is rendered below. */ }
  }

  if (!allowed) return null;
  return <Card className="mt-6 p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><h2 className="flex items-center gap-2 text-sm font-semibold"><Landmark size={17} /> Rent settlement destinations</h2><p className="mt-1 text-xs text-muted-foreground">Configure the account for each supported rent payment rail.</p></div>
      <Button size="sm" onClick={() => setOpen(true)}><Plus size={15} /> Add destination</Button>
    </div>
    {query.isLoading && <p role="status" className="mt-5 text-sm text-muted-foreground">Loading destinations...</p>}
    {query.isError && <Alert className="mt-4" tone="destructive">Could not load destinations. <Button variant="link" onClick={() => void query.refetch()}>Retry</Button></Alert>}
    {query.data?.length === 0 && <Alert className="mt-5" tone="warning">No active settlement destination is configured. Rent checkout remains unavailable until a destination is ready.</Alert>}
    {!!query.data?.length && <div className="mt-5 grid gap-3 lg:grid-cols-3">{query.data.map(destination => <div key={destination._id} className="rounded-md border border-border p-4">
      <div className="flex items-start justify-between gap-3"><div className="flex size-9 items-center justify-center rounded-md bg-muted">{destination.provider === 'PAYSTACK' ? <Building2 size={17} /> : destination.provider === 'MPESA' ? <Smartphone size={17} /> : <Bitcoin size={17} />}</div><StatusBadge status={destination.status} domain="integration">{destination.status.replaceAll('_', ' ')}</StatusBadge></div>
      <h3 className="mt-3 text-sm font-semibold">{destination.label}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{destination.provider === 'PAYSTACK' ? `${destination.accountName ?? 'Bank account'} **** ${destination.accountNumberLast4 ?? '----'}` : destination.provider === 'MPESA' ? `Shortcode ${destination.mpesaShortCode}` : `${destination.cryptoAsset} on ${destination.cryptoNetwork}`}</p>
      {destination.provider === 'PAYSTACK' && destination.status === 'PENDING_PROVIDER_SETUP' && <p className="mt-2 text-xs text-muted-foreground">Verify this subaccount in Paystack, then refresh its status before collecting rent.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {destination.provider === 'PAYSTACK' && destination.status !== 'DISABLED' && <Button variant="outline" size="sm" onClick={() => refresh.mutate(destination._id)} disabled={refresh.isPending}><RefreshCw size={14} /> Refresh status</Button>}
        {destination.status !== 'DISABLED' && <Button variant="ghost" size="sm" className="text-[var(--destructive)]" onClick={() => disable.mutate(destination._id)} disabled={disable.isPending}>Disable</Button>}
      </div>
    </div>)}</div>}
    {refresh.error && <Alert className="mt-3" tone="destructive">{refresh.error.message}</Alert>}
    {disable.error && <Alert className="mt-3" tone="destructive">{disable.error.message}</Alert>}
    <Dialog open={open} onOpenChange={setOpen} title="Add settlement destination" description="Bank account numbers are sent to Paystack and are not retained by this app.">
      <form className="space-y-4" onSubmit={event => void submit(event)}>
        <div><Label>Destination type</Label><Select value={provider} onChange={event => setProvider(event.target.value as typeof provider)}><option value="PAYSTACK">Paystack bank settlement</option><option value="MPESA">M-Pesa shortcode</option><option value="CRYPTO">Crypto wallet</option></Select></div>
        <div><Label htmlFor="destination-label">Label</Label><Input id="destination-label" name="label" required placeholder="Primary rent account" /></div>
        {provider === 'PAYSTACK' && <><div><Label>Account holder / business</Label><Input name="businessName" required /></div><div className="grid gap-3 sm:grid-cols-2"><div><Label>Paystack bank code</Label><Input name="bankCode" required /></div><div><Label>Account number</Label><Input name="accountNumber" inputMode="numeric" pattern="[0-9]{6,34}" required /></div></div><Alert tone="warning">After saving, verify the subaccount in your Paystack dashboard and refresh its status here. Rent checkout stays off until Paystack confirms verification.</Alert></>}
        {provider === 'MPESA' && <><div><Label>Paybill or till shortcode</Label><Input name="shortCode" inputMode="numeric" pattern="[0-9]{5,7}" required /></div><div><Label>Account reference</Label><Input name="accountReference" maxLength={40} /></div><Alert tone="warning">This destination becomes active only when the server&apos;s Daraja shortcode and credentials match it.</Alert></>}
        {provider === 'CRYPTO' && <><div className="grid gap-3 sm:grid-cols-2"><div><Label>Asset</Label><Select name="asset"><option>USDC</option><option>USDT</option><option>BTC</option><option>ETH</option></Select></div><div><Label>Network</Label><Select name="network"><option>BASE</option><option>ETHEREUM</option><option>POLYGON</option><option>BITCOIN</option></Select></div></div><div><Label>Wallet address</Label><Input name="walletAddress" minLength={20} required /></div><Alert tone="warning">The wallet is saved as pending. Tenant crypto checkout stays unavailable until a verified processor and blockchain reconciliation are connected.</Alert></>}
        {create.error && <Alert tone="destructive">{create.error.message}</Alert>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={create.isPending}>Save destination</Button></div>
      </form>
    </Dialog>
  </Card>;
}
