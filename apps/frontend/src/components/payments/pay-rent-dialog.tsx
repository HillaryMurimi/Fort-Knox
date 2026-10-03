'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, CreditCard, Loader2, Smartphone } from 'lucide-react';
import { StatusBadge, Alert, Button, Dialog, Input, Label, Select } from '@/components/ui';
import { useCreatePaymentMutation, useRentChargesQuery } from '@/hooks/queries/use-finance-queries';
import { useInitiateProviderPaymentMutation } from '@/hooks/queries/use-integration-queries';
import type { PaystackChannel, ProviderPaymentResult } from '@/lib/data/integrations';

const channels: Array<{value:PaystackChannel;label:string}>=[
  {value:'card',label:'Card'},{value:'bank',label:'Bank'},{value:'bank_transfer',label:'Bank transfer'},
  {value:'mobile_money',label:'Mobile money'},{value:'ussd',label:'USSD'},{value:'qr',label:'QR'},
  {value:'apple_pay',label:'Apple Pay'},{value:'eft',label:'EFT'},{value:'capitec_pay',label:'Capitec Pay'},
  {value:'payattitude',label:'Payattitude'},
];

export function PayRentDialog({organizationId,open,onOpenChange}:{organizationId:string|null;open:boolean;onOpenChange:(open:boolean)=>void}){
  const rent=useRentChargesQuery(organizationId);
  const createPayment=useCreatePaymentMutation(organizationId);
  const initiate=useInitiateProviderPaymentMutation(organizationId);
  const eligible=useMemo(()=>(rent.data??[]).filter(charge=>['OPEN','PARTIALLY_PAID','OVERDUE'].includes(charge.status)&&charge.balanceAmount>0),[rent.data]);
  const [chargeId,setChargeId]=useState('');
  const [provider,setProvider]=useState<'MPESA'|'PAYSTACK'>('MPESA');
  const [contact,setContact]=useState('');
  const [selectedChannels,setSelectedChannels]=useState<PaystackChannel[]>(channels.map(channel=>channel.value));
  const [result,setResult]=useState<ProviderPaymentResult|null>(null);
  const charge=eligible.find(item=>item._id===chargeId)??eligible[0];
  const busy=createPayment.isPending||initiate.isPending;

  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();if(!organizationId||!charge||busy)return;setResult(null);
    const payment=await createPayment.mutateAsync({tenancyId:charge.tenancyId,amount:charge.balanceAmount,currency:charge.currency,method:provider==='MPESA'?'MPESA':'OTHER',notes:`Tenant rent payment for charge ${charge._id}`});
    const response=await initiate.mutateAsync({paymentId:payment._id,input:{provider,...(provider==='MPESA'?{phone:contact}:{email:contact,...(selectedChannels.length===channels.length?{}:{paystackChannels:selectedChannels})})}});
    setResult(response);
  }

  const checkoutUrl=result?.checkoutUrl&&safeCheckoutUrl(result.checkoutUrl);
  return <Dialog open={open} onOpenChange={onOpenChange} title="Pay rent" description="Payments remain pending until the provider confirms the transaction." className="max-w-2xl">
    <form className="space-y-5" onSubmit={event=>void submit(event)}>
      {rent.isLoading?<div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="animate-spin" size={16}/>Loading your rent balance</div>:eligible.length===0?<Alert tone="success" title="Nothing due">Your rent ledger has no outstanding charge.</Alert>:<>
        <div><Label htmlFor="rent-charge">Rent charge</Label><Select id="rent-charge" value={charge?._id??''} onChange={event=>setChargeId(event.target.value)} required>{eligible.map(item=><option key={item._id} value={item._id}>{new Date(item.dueDate).toLocaleDateString()} - {item.currency} {item.balanceAmount.toLocaleString()}</option>)}</Select></div>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Payment provider">
          <button type="button" aria-pressed={provider==='MPESA'} onClick={()=>{setProvider('MPESA');setContact('');setResult(null);}} className={`rounded-md border p-4 text-left ${provider==='MPESA'?'border-[var(--primary)] bg-[var(--accent-soft)]':'border-border bg-card'}`}><Smartphone size={18}/><div className="mt-3 text-sm font-semibold">M-Pesa STK Push</div><div className="mt-1 text-xs text-muted-foreground">Approve the prompt on your phone.</div></button>
          <button type="button" aria-pressed={provider==='PAYSTACK'} onClick={()=>{setProvider('PAYSTACK');setContact('');setResult(null);}} className={`rounded-md border p-4 text-left ${provider==='PAYSTACK'?'border-[var(--primary)] bg-[var(--accent-soft)]':'border-border bg-card'}`}><CreditCard size={18}/><div className="mt-3 text-sm font-semibold">Paystack checkout</div><div className="mt-1 text-xs text-muted-foreground">Use any method enabled for this account.</div></button>
        </div>
        <div><Label htmlFor="payer-contact">{provider==='MPESA'?'M-Pesa phone':'Receipt email'}</Label><Input id="payer-contact" type={provider==='MPESA'?'tel':'email'} value={contact} onChange={event=>setContact(event.target.value)} placeholder={provider==='MPESA'?'+254712345678':'you@example.com'} pattern={provider==='MPESA'?'[+][1-9][0-9]{6,14}':undefined} required/></div>
        {provider==='PAYSTACK'&&<fieldset><legend className="field-label">Checkout methods</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{channels.map(channel=><label key={channel.value} className="flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-xs"><input type="checkbox" checked={selectedChannels.includes(channel.value)} onChange={event=>setSelectedChannels(current=>event.target.checked?[...current,channel.value]:current.filter(value=>value!==channel.value))}/>{channel.label}</label>)}</div><p className="mt-2 text-xs text-muted-foreground">Paystack shows only methods available for the landlord account and country.</p></fieldset>}
        <div className="flex items-center justify-between rounded-md border border-border bg-muted p-3"><div><div className="text-xs text-muted-foreground">Amount due</div><div className="mt-1 font-semibold">{charge?.currency} {charge?.balanceAmount.toLocaleString()}</div></div><StatusBadge status={charge?.status} domain="rent">{charge?.status}</StatusBadge></div>
      </>}
      {(createPayment.error||initiate.error)&&<Alert tone="destructive">{createPayment.error?.message??initiate.error?.message}</Alert>}
      {result&&<Alert tone={result.status==='FAILED'?'destructive':'success'} title={result.status==='PENDING'?'Payment request sent':'Provider response'}>{provider==='MPESA'?'Check your phone and enter your M-Pesa PIN.':result.customerMessage??'Continue in secure checkout.'}</Alert>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={()=>onOpenChange(false)}>Close</Button>{checkoutUrl?<a className="btn-primary inline-flex items-center justify-center gap-2" href={checkoutUrl} target="_blank" rel="noopener noreferrer"><CheckCircle2 size={16}/>Open secure checkout</a>:<Button type="submit" loading={busy} disabled={!charge||!contact||(provider==='PAYSTACK'&&selectedChannels.length===0)}>{provider==='MPESA'?'Send STK Push':'Continue to Paystack'}</Button>}</div>
    </form>
  </Dialog>;
}

function safeCheckoutUrl(value:string){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:undefined;}catch{return undefined;}}
