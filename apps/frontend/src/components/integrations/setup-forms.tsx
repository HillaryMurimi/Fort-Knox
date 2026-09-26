'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { integrationsClient } from '@/lib/data/integrations';
import { usePropertiesQuery } from '@/hooks/queries/use-property-queries';
import { useCreateCameraMutation } from '@/hooks/queries/use-security-queries';
import { usePaymentsQuery } from '@/hooks/queries/use-finance-queries';
import { useInitiateProviderPaymentMutation } from '@/hooks/queries/use-integration-queries';
import { useSetupPermission } from '@/hooks/use-setup-permission';
import type { PaymentInitiateInput } from '@/lib/data/integrations';

export function IntegrationSetupForms({ organizationId }: { organizationId: string }) {
  const camera = useSetupPermission(organizationId, 'cctv.manage');
  const payment = useSetupPermission(organizationId, 'payment.create');
  return <div className="grid gap-5 lg:grid-cols-2 my-6">
    {camera && <section className="card p-5"><h2 className="font-semibold mb-3">Connect CCTV</h2><CameraSetupForm organizationId={organizationId}/></section>}
    {payment && <section className="card p-5"><h2 className="font-semibold mb-3">Set up a payment</h2><PaymentSetupForm organizationId={organizationId}/></section>}
  </div>;
}

export function CameraSetupForm({ organizationId, onDone }: { organizationId: string; onDone?: () => void }) {
  const properties = usePropertiesQuery(organizationId);
  const create = useCreateCameraMutation(organizationId);
  const [saved, setSaved] = useState(false);
  const [cameraId, setCameraId] = useState<string>();
  const health = useMutation({ mutationFn: (id: string) => integrationsClient.cctvHealth(organizationId, id) });
  return <form className="space-y-4" onSubmit={event => {
    event.preventDefault();
    if (create.isPending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const propertyId = String(data.get('propertyId'));
    if (!properties.data?.some(property => property._id === propertyId)) return;
    const provider = String(data.get('provider'));
    setSaved(false);
    create.mutate({ propertyId, name: String(data.get('name')).trim(), cameraCode: String(data.get('cameraCode')).trim(), provider, connectionType: provider === 'NVR_HTTP' ? 'NVR' : 'HTTP', streamRef: String(data.get('streamRef')).trim() }, { onSuccess: result => { setSaved(true); health.reset(); if (result && typeof result === 'object' && '_id' in result && typeof result._id === 'string') setCameraId(result._id); form.reset(); } });
  }}>
    <p className="text-sm text-muted-foreground">Choose your property and enter the camera reference supplied by your installer. Your installer must first connect the camera to the secure streaming gateway.</p>
    <fieldset className="space-y-3" disabled={create.isPending || properties.isLoading || properties.isError}>
      <label className="block">Property<select name="propertyId" required><option value="">Choose a property</option>{(properties.data ?? []).map(property => <option key={property._id} value={property._id}>{property.name}</option>)}</select></label>
      <label className="block">Camera name<input name="name" required maxLength={160} placeholder="Main entrance"/></label>
      <label className="block">Camera code<input name="cameraCode" required maxLength={80} placeholder="ENTRANCE-01"/></label>
      <label className="block">Connection<select name="provider"><option value="GENERIC_CCTV">Streaming gateway</option><option value="NVR_HTTP">NVR through gateway</option></select></label>
      <label className="block">Gateway camera reference<input name="streamRef" required maxLength={160} pattern="[a-zA-Z0-9_.-]+" title="Use the camera identifier from your installer, with letters, numbers, dots, underscores or hyphens." placeholder="entrance-camera-01"/></label>
    </fieldset>
    {properties.isLoading && <p role="status">Loading properties?</p>}
    {properties.isError && <p role="alert">Unable to load properties. <button type="button" onClick={() => void properties.refetch()}>Retry</button></p>}
    {!properties.isLoading && !properties.isError && !properties.data?.length && <p><Link href="/properties">Add a property first</Link>.</p>}
    {create.error && <p role="alert" className="text-[var(--danger-text)]">{create.error.message}</p>}
    {saved && <p role="status" className="text-[var(--success-text)]">Camera registered. Live availability must still be checked with the connected provider.</p>}
    {cameraId && <div className="space-y-2"><button type="button" className="btn-secondary" disabled={health.isPending} onClick={() => health.mutate(cameraId)}>{health.isPending ? 'Checking?' : 'Check camera connection'}</button>{health.data && <p role="status">Provider status: {health.data.status}</p>}{health.error && <p role="alert">Unable to verify connection: {health.error.message}</p>}{onDone && <button type="button" className="btn-secondary" onClick={onDone}>Done</button>}</div>}
    <button className="btn-primary" disabled={create.isPending || !properties.data?.length || properties.isError}>{create.isPending ? 'Registering?' : 'Register camera'}</button>
  </form>;
}

function PaymentSetupForm({ organizationId }: { organizationId: string }) {
  const payments = usePaymentsQuery(organizationId);
  const initiate = useInitiateProviderPaymentMutation(organizationId);
  const [provider, setProvider] = useState<PaymentInitiateInput['provider']>('MPESA');
  const eligible = (payments.data ?? []).filter(payment => payment.status === 'PENDING' && !payment.providerTransactionId);
  return <form className="space-y-4" onSubmit={event => {
    event.preventDefault();
    if (initiate.isPending) return;
    const data = new FormData(event.currentTarget);
    const paymentId = String(data.get('paymentId'));
    if (!eligible.some(payment => payment._id === paymentId)) return;
    const contact = String(data.get('contact') ?? '').trim();
    initiate.mutate({ paymentId, input: { provider, ...(provider === 'MPESA' ? { phone: contact } : provider === 'PAYSTACK' ? { email: contact } : {}) } });
  }}>
    <p className="text-sm text-muted-foreground">Select a pending payment and request collection through your configured provider. Payment is confirmed only after provider verification.</p>
    <fieldset className="space-y-3" disabled={initiate.isPending || payments.isLoading || payments.isError}>
      <label className="block">Payment<select name="paymentId" required><option value="">Choose a pending payment</option>{eligible.map(payment => <option key={payment._id} value={payment._id}>{payment.receiptNumber || payment._id.slice(-6)} ? {payment.currency} {payment.amount.toLocaleString()}</option>)}</select></label>
      <label className="block">Payment provider<select value={provider} onChange={event => { setProvider(event.target.value as PaymentInitiateInput['provider']); initiate.reset(); }}><option value="MPESA">M-Pesa</option><option value="PAYSTACK">Paystack</option><option value="STRIPE">Stripe</option></select></label>
      {provider === 'MPESA' && <label className="block">Payer phone<input key="phone" name="contact" type="tel" required pattern="[+][1-9][0-9]{6,14}" placeholder="+254712345678"/></label>}
      {provider === 'PAYSTACK' && <label className="block">Payer email<input key="email" name="contact" type="email" required placeholder="tenant@example.com"/></label>}
    </fieldset>
    {payments.isLoading && <p role="status">Loading payments?</p>}
    {payments.isError && <p role="alert">Unable to load payments. <button type="button" onClick={() => void payments.refetch()}>Retry</button></p>}
    {!payments.isLoading && !payments.isError && eligible.length === 0 && <p className="text-sm">No pending payments are ready to initiate. <Link className="underline" href="/finance">Create a payment in Finance</Link>.</p>}
    {initiate.error && <p role="alert" className="text-[var(--danger-text)]">{initiate.error.message}</p>}
    {initiate.data && <p role="status">Provider response: {initiate.data.status}. {initiate.data.customerMessage} Check Finance for verified payment status.</p>}
    {initiate.data?.checkoutUrl && safeCheckoutUrl(initiate.data.checkoutUrl) && <a className="btn-secondary" href={safeCheckoutUrl(initiate.data.checkoutUrl)} target="_blank" rel="noopener noreferrer">Open secure checkout</a>}
    <button className="btn-primary" disabled={initiate.isPending || payments.isError || eligible.length === 0}>{initiate.isPending ? 'Requesting?' : 'Request payment'}</button>
    <p className="text-xs text-muted-foreground">If your provider is not configured, your administrator must complete the secure account connection first.</p>
  </form>;
}

function safeCheckoutUrl(value: string): string | undefined {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}
