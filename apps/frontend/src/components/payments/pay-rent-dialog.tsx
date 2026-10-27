'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Check, Copy, Loader2, Smartphone } from 'lucide-react';
import { Alert, Button, Dialog, Input, Label, Select } from '@/components/ui';
import { useCreatePaymentMutation, useRentChargesQuery, useTenancyPaymentInstructionsQuery } from '@/hooks/queries/use-finance-queries';
import { useInitiateProviderPaymentMutation } from '@/hooks/queries/use-integration-queries';

export function PayRentDialog({organizationId,tenancyId,open,onOpenChange}:{organizationId:string|null;tenancyId:string|null;open:boolean;onOpenChange:(open:boolean)=>void}){
  const rent=useRentChargesQuery(organizationId);
  const instructions=useTenancyPaymentInstructionsQuery(tenancyId,open);
  const createPayment=useCreatePaymentMutation(organizationId);
  const initiate=useInitiateProviderPaymentMutation(organizationId);
  const eligible=useMemo(()=>(rent.data??[]).filter(charge=>charge.tenancyId===tenancyId&&['OPEN','PARTIALLY_PAID','OVERDUE'].includes(charge.status)&&charge.balanceAmount>0),[rent.data,tenancyId]);
  const [chargeId,setChargeId]=useState('');
  const [phone,setPhone]=useState('');
  const [copied,setCopied]=useState<string|null>(null);
  const [requested,setRequested]=useState(false);
  const charge=eligible.find(item=>item._id===chargeId)??eligible[0];
  const method=instructions.data?.methods[0];
  const busy=createPayment.isPending||initiate.isPending;

  async function copy(value:string,label:string){
    try{await navigator.clipboard.writeText(value);setCopied(label);}catch{setCopied(null);}
  }

  async function requestStk(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!organizationId||!tenancyId||!charge||!method?.canInitiateStk||busy)return;
    setRequested(false);
    try{
      const payment=await createPayment.mutateAsync({tenancyId,amount:charge.balanceAmount,currency:charge.currency,method:'MPESA',notes:`Tenant rent payment for charge ${charge._id}`});
      await initiate.mutateAsync({paymentId:payment._id,input:{provider:'MPESA',phone}});
      setRequested(true);
    }catch{/* Errors are rendered below; no payment is claimed as complete. */}
  }

  return <Dialog open={open} onOpenChange={onOpenChange} title="Pay rent" description="Pay directly to your property management account. Instructions are not proof of payment." className="max-w-xl">
    <div className="space-y-5">
      {instructions.isLoading?<p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="animate-spin" size={16}/>Loading receiving details</p>:instructions.isError?<Alert tone="destructive">Payment details could not be loaded. <Button variant="link" onClick={()=>void instructions.refetch()}>Retry</Button></Alert>:!method?<Alert tone="warning" title="Payment instructions unavailable">Your landlord has not configured an attested receiving account for this home. Contact management before sending rent.</Alert>:<>
        <div className="rounded-md border border-border p-4">
          <div className="flex items-center gap-2 text-sm font-semibold"><Smartphone size={17}/>{method.label}</div>
          <p className="mt-1 text-xs text-muted-foreground">Owner-attested {method.businessType==='PAYBILL'?'M-Pesa PayBill':'M-Pesa Till'} instructions. Account ownership and this payment have not been independently verified.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Instruction label={method.businessType==='PAYBILL'?'PayBill number':'Till number'} value={method.shortCode} copied={copied} onCopy={copy}/>
            {method.accountReference&&<Instruction label="Account reference" value={method.accountReference} copied={copied} onCopy={copy}/>}
          </div>
        </div>
        {rent.isLoading?<p role="status" className="text-sm text-muted-foreground">Loading rent balance...</p>:eligible.length===0?<Alert tone="success" title="Nothing due">Your rent ledger has no outstanding charge.</Alert>:<div><Label htmlFor="rent-charge">Outstanding rent</Label><Select id="rent-charge" value={charge?._id??''} onChange={event=>setChargeId(event.target.value)}>{eligible.map(item=><option key={item._id} value={item._id}>{item.currency} {item.balanceAmount.toLocaleString('en-KE')} due {new Date(item.dueDate).toLocaleDateString('en-KE')}</option>)}</Select></div>}
        <Alert tone="warning">Paying using these details does not mark rent as paid. Your balance changes only after authorized verification or an audited management acknowledgment.</Alert>
        {method.canInitiateStk&&charge&&<form className="space-y-3 border-t border-border pt-4" onSubmit={event=>void requestStk(event)}><h3 className="text-sm font-semibold">M-Pesa STK Push</h3><div><Label htmlFor="payer-phone">Your M-Pesa phone</Label><Input id="payer-phone" type="tel" value={phone} onChange={event=>setPhone(event.target.value)} pattern="[+][1-9][0-9]{6,14}" placeholder="+254712345678" required/></div><Button type="submit" loading={busy} disabled={!phone}>Send payment prompt</Button></form>}
        {(createPayment.error||initiate.error)&&<Alert tone="destructive">{createPayment.error?.message??initiate.error?.message}</Alert>}
        {requested&&<Alert tone="warning" title="Payment request sent">Approve the prompt on your phone. Rent remains outstanding until the provider confirms and the ledger is updated.</Alert>}
      </>}
      <div className="flex justify-end"><Button type="button" variant="outline" onClick={()=>onOpenChange(false)}>Close</Button></div>
    </div>
  </Dialog>;
}

function Instruction({label,value,copied,onCopy}:{label:string;value:string;copied:string|null;onCopy:(value:string,label:string)=>void}){
  return <div className="min-w-0 rounded-md bg-muted p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 flex items-center justify-between gap-2"><span className="break-all font-mono text-sm font-semibold">{value}</span><Button type="button" variant="ghost" size="icon" aria-label={`Copy ${label}`} onClick={()=>onCopy(value,label)}>{copied===label?<Check size={16}/>:<Copy size={16}/>}</Button></div></div>;
}
