"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, CreditCard, FileSignature, ShieldCheck } from "lucide-react";
import { Alert, Button, Input } from "@/components/ui";
import { useOrganization } from "@/hooks/use-organization";
import { useBillingPlansQuery, useBillingSubscriptionQuery, useSubscribeMutation } from "@/hooks/queries/use-billing-queries";

const steps = [
  { label: "Plan", icon: ShieldCheck },
  { label: "Agreement", icon: FileSignature },
  { label: "Invoice", icon: CreditCard },
];

export default function LandlordOnboardingPage() {
  const router = useRouter();
  const { activeOrganizationId } = useOrganization();
  const plans = useBillingPlansQuery();
  const subscription = useBillingSubscriptionQuery(activeOrganizationId ?? undefined);
  const subscribe = useSubscribeMutation(activeOrganizationId ?? undefined);
  const [step, setStep] = useState(0);
  const [planKey, setPlanKey] = useState("CONTROL");
  const [prepaidMonths, setPrepaidMonths] = useState(3);
  const [billingEmail, setBillingEmail] = useState("");
  const [accepted, setAccepted] = useState(false);
  const selected = useMemo(() => plans.data?.find((plan) => plan.key === planKey), [plans.data, planKey]);
  const total = (selected?.amount ?? 0) * prepaidMonths;

  function next() {
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    if (!selected || !activeOrganizationId) return;
    subscribe.mutate({ planKey: selected.key, provider: "PAYSTACK", email: billingEmail, prepaidMonths });
  }

  if (!activeOrganizationId) {
    return <main className="min-h-screen bg-muted p-6"><div className="mx-auto mt-20 max-w-xl rounded-2xl border border-border bg-card p-8 text-center"><h1 className="text-2xl font-semibold">Finish your landlord setup</h1><p className="mt-3 text-sm text-muted-foreground">Sign in with the organization owner account before starting activation.</p><Button className="mt-6" onClick={() => router.push("/login")}>Go to sign in</Button></div></main>;
  }
  return (
    <main className="min-h-screen bg-muted px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-accent-foreground">Landlord onboarding</p>
            <h1 className="mt-2 text-3xl font-semibold">Activate your Command Center</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Choose your operating tier, review the agreement and pay the initial prepaid period before activation.</p>
          </div>
          <div className="hidden rounded-full border border-border bg-card px-4 py-2 text-xs font-medium sm:block">Step {step + 1} of 3</div>
        </div>
        <div className="mb-8 grid gap-3 sm:grid-cols-3">
          {steps.map((item, index) => { const Icon = item.icon; return <div key={item.label} className={`rounded-xl border p-3 ${index === step ? "border-primary bg-card" : "border-border bg-background"}`}><div className="flex items-center gap-2 text-sm font-medium"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">{index < step ? <Check size={15} /> : <Icon size={15} />}</span>{item.label}</div></div>; })}
        </div>
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-8">
            {step === 0 && <div>
              <h2 className="text-xl font-semibold">Select your operating tier</h2>
              <p className="mt-2 text-sm text-muted-foreground">Control is the operating foundation. Fort Knox adds CCTV, evidence, advanced intelligence and security controls.</p>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {(plans.data ?? []).filter((plan) => ["CONTROL", "FORT_KNOX"].includes(plan.key)).map((plan) => <button type="button" key={plan.key} onClick={() => setPlanKey(plan.key)} className={`rounded-2xl border p-5 text-left ${plan.key === planKey ? "border-primary ring-2 ring-primary/20" : "border-border"}`}><div className="flex items-center justify-between"><span className="font-semibold">{plan.name}</span><span className="text-sm font-semibold">{plan.currency} {plan.amount.toLocaleString()} / month</span></div><p className="mt-3 text-sm text-muted-foreground">{plan.description}</p><div className="mt-4 flex flex-wrap gap-2">{plan.entitlements.features.slice(0, 6).map((feature) => <span key={feature} className="rounded-full bg-muted px-2 py-1 text-[10px]">{feature.replaceAll("-", " ")}</span>)}</div></button>)}
              </div>
              <label className="mt-7 block text-sm font-medium">Billing email<Input type="email" required value={billingEmail} onChange={(event) => setBillingEmail(event.target.value)} placeholder="accounts@yourcompany.co.ke" className="mt-2" /></label>
              <label className="mt-5 block text-sm font-medium">Initial prepaid period<select value={prepaidMonths} onChange={(event) => setPrepaidMonths(Number(event.target.value))} className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">{[3, 6, 12, 24].map((months) => <option key={months} value={months}>{months} months upfront</option>)}</select></label>
            </div>}
            {step === 1 && <div>
              <h2 className="text-xl font-semibold">Review and sign the services agreement</h2>
              <p className="mt-2 text-sm text-muted-foreground">This agreement records the selected tier, prepaid period and recurring billing arrangement.</p>
              <article className="mt-6 max-h-96 overflow-auto rounded-xl border border-border bg-background p-5 text-sm leading-7">
                <h3 className="font-semibold">Property Command Center — Services Agreement</h3>
                <p className="mt-3">The organization owner subscribes to the {selected?.name ?? planKey} plan for the managed property portfolio.</p>
                <p>The initial activation invoice covers {prepaidMonths} months at {selected?.currency ?? "KES"} {total.toLocaleString()}. After the prepaid period, the subscription renews monthly at the selected plan rate unless cancelled according to the subscription terms.</p>
                <p>Access is activated only after a verified provider payment. Provider webhooks and reconciliation are authoritative; opening checkout does not activate the account.</p>
              </article>
              <label className="mt-5 flex items-start gap-3 text-sm"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1" /><span>I confirm that I am authorized to subscribe this organization and accept the agreement and billing terms.</span></label>
            </div>}
            {step === 2 && <div>
              <h2 className="text-xl font-semibold">Review your activation invoice</h2>
              <div className="mt-6 rounded-xl border border-border bg-background p-5"><div className="flex justify-between text-sm"><span>{selected?.name ?? planKey} × {prepaidMonths} months</span><span>{selected?.currency ?? "KES"} {total.toLocaleString()}</span></div><div className="mt-4 flex justify-between border-t border-border pt-4 font-semibold"><span>Amount payable today</span><span>{selected?.currency ?? "KES"} {total.toLocaleString()}</span></div></div>
              <p className="mt-4 text-sm text-muted-foreground">You will be redirected to Paystack’s secure checkout. The subscription stays pending until the signed payment webhook is verified.</p>
              {subscribe.error && <Alert tone="destructive" className="mt-4">{subscribe.error.message}</Alert>}
              {subscribe.data?.providerCheckoutUrl && <div className="mt-5"><a href={subscribe.data.providerCheckoutUrl} target="_blank" rel="noreferrer" className="btn-primary inline-flex">Open secure checkout</a></div>}
            </div>}
          </section>
          <aside className="h-fit rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">Activation summary</p>
            <div className="mt-5 space-y-4 text-sm"><div className="flex justify-between gap-4"><span className="text-muted-foreground">Tier</span><span className="font-medium">{selected?.name ?? "Select a tier"}</span></div><div className="flex justify-between gap-4"><span className="text-muted-foreground">Upfront term</span><span className="font-medium">{prepaidMonths} months</span></div><div className="flex justify-between gap-4"><span className="text-muted-foreground">Due today</span><span className="font-semibold">{selected?.currency ?? "KES"} {total.toLocaleString()}</span></div></div>
            <div className="mt-6 rounded-xl bg-muted p-4 text-xs leading-5 text-muted-foreground">Minimum initial payment: 3 months. Longer prepaid periods are supported. Monthly billing begins after the prepaid term.</div>
            <div className="mt-6 flex gap-3"><Button variant="secondary" disabled={step === 0} onClick={() => setStep((currentStep) => currentStep - 1)}><ChevronLeft size={16} /> Back</Button>{step < 2 ? <Button disabled={step === 0 ? !selected : !accepted || !billingEmail} onClick={next}>Continue <ChevronRight size={16} /></Button> : <Button disabled={!accepted || !billingEmail} loading={subscribe.isPending} onClick={next}>Create invoice <CreditCard size={16} /></Button>}</div>
          </aside>
        </div>
        {subscription.data?.status === "ACTIVE" && <Alert tone="success" className="mt-6">Your subscription is active. You can now enter the Command Center.</Alert>}
      </div>
    </main>
  );
}
