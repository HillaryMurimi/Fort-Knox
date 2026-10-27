'use client';

import { useState, type FormEvent } from 'react';
import { Bitcoin, Building2, Landmark, Plus, Smartphone } from 'lucide-react';
import { StatusBadge, Alert, Button, Card, Dialog, Input, Label, Select } from '@/components/ui';
import {
  useCreatePaymentDestinationMutation,
  useDisablePaymentDestinationMutation,
  usePaymentDestinationsQuery,
} from '@/hooks/queries/use-finance-queries';
import { usePropertiesQuery } from '@/hooks/queries/use-property-queries';
import { useSetupPermission } from '@/hooks/use-setup-permission';
import type { PaymentDestinationInput } from '@/lib/data/finance';

export function PaymentDestinations({ organizationId }: { organizationId: string | null }) {
  const allowed = useSetupPermission(organizationId ?? '', 'organization.settings.manage');
  const query = usePaymentDestinationsQuery(organizationId, allowed);
  const create = useCreatePaymentDestinationMutation(organizationId);
  const disable = useDisablePaymentDestinationMutation(organizationId);
  const properties = usePropertiesQuery(organizationId);
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<'MPESA' | 'CRYPTO'>('MPESA');
  const [businessType, setBusinessType] = useState<'PAYBILL' | 'TILL'>('PAYBILL');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    let input: PaymentDestinationInput;
    if (provider === 'MPESA') {
      const accountReference = String(data.get('accountReference') || '');
      const propertyId = String(data.get('propertyId') || '');
      input = { provider, label: String(data.get('label')), shortCode: String(data.get('shortCode')),
        businessType: data.get('businessType') as 'PAYBILL' | 'TILL', ownershipAttested: true,
        currency: 'KES', country: 'KE', isDefault: !propertyId, ...(propertyId ? { propertyId } : {}),
        ...(accountReference ? { accountReference } : {}) };
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
      <div><h2 className="flex items-center gap-2 text-sm font-semibold"><Landmark size={17} /> Rent collection settings</h2><p className="mt-1 text-xs text-muted-foreground">Give residents the correct owner-controlled payment instructions.</p></div>
      <Button size="sm" onClick={() => setOpen(true)}><Plus size={15} /> Add destination</Button>
    </div>
    {query.isLoading && <p role="status" className="mt-5 text-sm text-muted-foreground">Loading destinations...</p>}
    {query.isError && <Alert className="mt-4" tone="destructive">Could not load destinations. <Button variant="link" onClick={() => void query.refetch()}>Retry</Button></Alert>}
    {query.data?.length === 0 && <Alert className="mt-5" tone="warning">No active settlement destination is configured. Rent checkout remains unavailable until a destination is ready.</Alert>}
    {!!query.data?.length && <div className="mt-5 grid gap-3 lg:grid-cols-3">{query.data.map(destination => <div key={destination._id} className="rounded-md border border-border p-4">
      <div className="flex items-start justify-between gap-3"><div className="flex size-9 items-center justify-center rounded-md bg-muted">{destination.provider === 'PAYSTACK' ? <Building2 size={17} /> : destination.provider === 'MPESA' ? <Smartphone size={17} /> : <Bitcoin size={17} />}</div><StatusBadge status={destination.status} domain="integration">{destination.status.replaceAll('_', ' ')}</StatusBadge></div>
      <h3 className="mt-3 text-sm font-semibold">{destination.label}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{destination.provider === 'PAYSTACK' ? `Legacy Paystack bank **** ${destination.accountNumberLast4 ?? '----'}` : destination.provider === 'MPESA' ? `${destination.mpesaBusinessType ?? 'M-Pesa'} ${destination.mpesaShortCode}` : `${destination.cryptoAsset} on ${destination.cryptoNetwork}`}</p>
      {destination.propertyId&&<p className="mt-1 text-xs text-muted-foreground">Property: {properties.data?.find(property=>property._id===destination.propertyId)?.name??'Property-specific'}</p>}
      {destination.provider === 'PAYSTACK'&&<p className="mt-2 text-xs text-muted-foreground">Rent checkout is disabled pending a separate merchant agreement. Subscription billing is unaffected.</p>}
      {destination.provider === 'MPESA'&&<p className="mt-2 text-xs text-muted-foreground">{destination.ownerAttestedAt?'Owner-attested instructions; payment verification is separate.':'Legacy details hidden from residents until replaced with owner-attested instructions.'}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {destination.status !== 'DISABLED' && <Button variant="ghost" size="sm" className="text-[var(--destructive)]" onClick={() => disable.mutate(destination._id)} disabled={disable.isPending}>Disable</Button>}
      </div>
    </div>)}</div>}
    {disable.error && <Alert className="mt-3" tone="destructive">{disable.error.message}</Alert>}
    <Dialog open={open} onOpenChange={setOpen} title="Add receiving instructions" description="Only enter an account the landlord is authorized to use. Instructions do not verify a payment.">
      <form className="space-y-4" onSubmit={event => void submit(event)}>
        <div><Label htmlFor="destination-type">Destination type</Label><Select id="destination-type" value={provider} onChange={event => setProvider(event.target.value as typeof provider)}><option value="MPESA">M-Pesa PayBill or Till</option><option value="CRYPTO">Crypto wallet (pending)</option></Select></div>
        <div><Label htmlFor="destination-label">Label</Label><Input id="destination-label" name="label" required placeholder="Primary rent account" /></div>
        {provider === 'MPESA' && <><div><Label htmlFor="destination-property">Applies to</Label><Select id="destination-property" name="propertyId"><option value="">All properties (organization default)</option>{properties.data?.map(property=><option key={property._id} value={property._id}>{property.name}</option>)}</Select></div><div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="mpesa-type">Business type</Label><Select id="mpesa-type" name="businessType" value={businessType} onChange={event=>setBusinessType(event.target.value as typeof businessType)}><option value="PAYBILL">PayBill</option><option value="TILL">Till</option></Select></div><div><Label htmlFor="mpesa-shortcode">Business number</Label><Input id="mpesa-shortcode" name="shortCode" inputMode="numeric" pattern="[0-9]{5,7}" required /></div></div><div><Label htmlFor="mpesa-reference">Account reference (PayBill required)</Label><Input id="mpesa-reference" name="accountReference" maxLength={40} required={businessType==='PAYBILL'} placeholder="Use {{leaseNumber}} for each tenancy" /></div><label className="flex items-start gap-2 text-xs"><input type="checkbox" required className="mt-0.5" />I confirm this is a landlord-authorized receiving account. This does not verify payments.</label><Alert tone="warning">Residents will see these instructions. STK Push stays unavailable unless authorized credentials for this exact landlord and shortcode are configured on the server.</Alert></>}
        {provider === 'CRYPTO' && <><div className="grid gap-3 sm:grid-cols-2"><div><Label>Asset</Label><Select name="asset"><option>USDC</option><option>USDT</option><option>BTC</option><option>ETH</option></Select></div><div><Label>Network</Label><Select name="network"><option>BASE</option><option>ETHEREUM</option><option>POLYGON</option><option>BITCOIN</option></Select></div></div><div><Label>Wallet address</Label><Input name="walletAddress" minLength={20} required /></div><Alert tone="warning">The wallet is saved as pending. Tenant crypto checkout stays unavailable until a verified processor and blockchain reconciliation are connected.</Alert></>}
        {create.error && <Alert tone="destructive">{create.error.message}</Alert>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={create.isPending}>Save destination</Button></div>
      </form>
    </Dialog>
  </Card>;
}
