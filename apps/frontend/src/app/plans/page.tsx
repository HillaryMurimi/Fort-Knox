"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, ChevronRight, Info, Minus, Plus, ShieldCheck } from "lucide-react";
import { Alert, Button, Input, Skeleton, buttonClassName } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import {
  parseSignupContext, pauseJourneyAnalytics, publicPlanCatalog,
  signupHref, trackAcquisition, type AcquisitionPlanKey,
} from "@/lib/acquisition";
import { comparisonFeatures, featurePresentation } from "@/lib/plans-view-model";

const money = (minor: number, currency = "KES") =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency }).format(minor / 100);

function PlanComparison() {
  const search = useSearchParams();
  const context = parseSignupContext(search.toString());
  const [units, setUnits] = useState(String(context.unitCount));
  const [months, setMonths] = useState(context.prepaidMonths);
  const [selectedKey, setSelectedKey] = useState<AcquisitionPlanKey>(context.planKey);
  const [paused, setPaused] = useState(false);
  const count = Number(units);
  const valid = units !== "" && Number.isInteger(count) && count >= 0 && count <= 100000;
  const catalog = useQuery({
    queryKey: ["public-plan-catalog", count, months],
    queryFn: () => publicPlanCatalog(count, months),
    enabled: valid,
    staleTime: 30_000,
  });
  const plans = catalog.data?.plans ?? [];
  const selected = plans.find(plan => plan.key === selectedKey);
  const features = comparisonFeatures(plans);

  return <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-6 sm:px-8 sm:pt-9">
      <nav className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-5" aria-label="Plans navigation">
        <Link href="/" className="text-lg font-semibold focus-visible:outline-2 focus-visible:outline-offset-4">{BRAND.name}</Link>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--muted-foreground)]">
          <Link href="/demo" className="hover:text-[var(--foreground)]">Explore demo</Link>
          <Link href="/login?next=%2Fonboarding" className="hover:text-[var(--foreground)]">Resume setup <ArrowRight size={14} className="inline" aria-hidden="true" /></Link>
        </div>
      </nav>

      <header className="grid gap-8 py-12 md:grid-cols-[minmax(0,1fr)_minmax(16rem,24rem)] md:items-end md:py-16">
        <div>
          <p className="text-xs font-semibold uppercase text-[var(--accent-strong)]">Dapinni plans</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">One portfolio. A clearer view of everything.</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[var(--muted-foreground)]">Choose the scope of your command center. Pricing comes from the current plan catalog and is confirmed again in your agreement and invoice.</p>
        </div>
        <div className="border-l-2 border-[var(--border)] pl-5 text-sm leading-6 text-[var(--muted-foreground)]">
          <p className="font-semibold text-[var(--foreground)]">Start with the portfolio you plan to manage.</p>
          <p className="mt-2">Create your account, verify your email, review and sign the agreement, then complete secure payment. Property setup follows activation.</p>
        </div>
      </header>

      <section aria-labelledby="quote-heading" className="border-y border-[var(--border)] bg-[var(--panel)] px-4 py-6 sm:px-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div><h2 id="quote-heading" className="text-base font-semibold">Build your quote</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">Unit count affects the quote only above each plan&apos;s included allowance.</p></div>
          <div className="flex flex-wrap items-end gap-4">
            <div><label htmlFor="planned-units" className="block text-xs font-semibold">Planned units</label><div className="mt-2 flex items-center">
              <Button type="button" variant="outline" size="icon" aria-label="Remove one unit" disabled={!valid || count === 0} onClick={() => setUnits(String(count - 1))}><Minus size={16} /></Button>
              <span className="mx-2 w-24"><Input id="planned-units" type="number" inputMode="numeric" min={0} max={100000} step={1} value={units} onChange={event => setUnits(event.target.value)} aria-invalid={!valid} className="text-center tabular-nums" /></span>
              <Button type="button" variant="outline" size="icon" aria-label="Add one unit" disabled={!valid || count === 100000} onClick={() => setUnits(String(count + 1))}><Plus size={16} /></Button>
            </div></div>
            <div><label htmlFor="prepaid-term" className="block text-xs font-semibold">Initial commitment</label><select id="prepaid-term" className="input mt-2 min-w-40" value={months} onChange={event => setMonths(Number(event.target.value))}>{[3, 6, 12, 24].map(term => <option key={term} value={term}>{term} months upfront</option>)}</select></div>
          </div>
        </div>
        {!valid && <Alert tone="destructive" className="mt-4">Enter a whole unit count from 0 to 100,000.</Alert>}
      </section>

      {catalog.isPending && valid && <div className="mt-8 grid gap-4 md:grid-cols-2" role="status" aria-label="Loading current prices">{[0, 1].map(index => <Skeleton key={index} className="h-80" />)}</div>}
      {catalog.isError && <Alert tone="destructive" className="mt-7"><div className="flex flex-wrap items-center gap-3"><span>{catalog.error.message}</span><Button variant="outline" size="sm" onClick={() => void catalog.refetch()}>Retry prices</Button></div></Alert>}
      {catalog.data && plans.length === 0 && <Alert className="mt-7">No subscription tier currently has a published price. Please contact us before proceeding.</Alert>}
      {catalog.data?.unavailablePlans?.map(plan => <Alert key={plan.key} tone="warning" className="mt-4">{plan.name}: {plan.reason}</Alert>)}

      {plans.length > 0 && <section aria-labelledby="tiers-heading" className="pt-10">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">Subscription tiers</p><h2 id="tiers-heading" className="mt-2 text-2xl font-semibold">Choose your level of control</h2></div><p className="text-sm text-[var(--muted-foreground)]">All amounts in {plans[0]?.pricing.currency}</p></div>
        <div className="grid gap-4 md:grid-cols-2">{plans.map(plan => {
          const active = selectedKey === plan.key;
          const price = plan.pricing;
          return <article key={plan.key} className={cn("relative flex min-w-0 flex-col rounded-md border bg-[var(--panel)] p-5 transition-colors sm:p-7", active ? "border-[var(--foreground)]" : "border-[var(--border)] hover:border-[var(--border-strong)]")}>
            <div className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><span className={cn("flex h-9 w-9 items-center justify-center rounded-md", plan.key === "FORT_KNOX" ? "bg-[var(--muted)] text-[var(--accent-strong)]" : "bg-[var(--muted)] text-[var(--foreground)]")}><ShieldCheck size={19} /></span><h3 className="text-lg font-semibold">{plan.name}</h3></div>{active && <span className="text-xs font-semibold text-[var(--accent-strong)]"><Check size={14} className="mr-1 inline" />Selected</span>}</div>
            <p className="mt-3 min-h-12 text-sm leading-6 text-[var(--muted-foreground)]">{plan.description}</p>
            <div className="mt-6 border-t border-[var(--border)] pt-5"><p className="text-xs font-medium text-[var(--muted-foreground)]">Monthly equivalent</p><p className="mt-1 text-3xl font-semibold tabular-nums" aria-live="polite">{money(price.monthlyMinor, price.currency)}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">Base {money(price.baseMonthlyMinor, price.currency)} + {price.extraUnits} additional units at {money(price.additionalUnitMinor, price.currency)} each</p></div>
            <dl className="mt-6 space-y-3 text-sm"><div className="flex justify-between gap-3"><dt className="text-[var(--muted-foreground)]">Included units</dt><dd className="font-medium tabular-nums">{price.includedUnits}</dd></div><div className="flex justify-between gap-3"><dt className="text-[var(--muted-foreground)]">Due for {months} months upfront</dt><dd className="font-semibold tabular-nums">{money(price.totalMinor, price.currency)}</dd></div><div className="flex justify-between gap-3"><dt className="text-[var(--muted-foreground)]">Later {price.billingCycle.toLowerCase()} cycle</dt><dd className="font-medium tabular-nums">{money(price.recurringMinor, price.currency)}</dd></div></dl>
            <div className="mt-6 border-t border-[var(--border)] pt-5"><p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">Included capabilities</p><ul className="mt-3 grid gap-2">{plan.features.map(feature => <li key={feature} className="flex items-start gap-2 text-sm"><Check size={15} className="mt-0.5 shrink-0 text-[var(--accent-strong)]" aria-hidden="true" />{featurePresentation(feature).label}</li>)}</ul></div>
            <Button type="button" variant={active ? "default" : "outline"} onClick={() => setSelectedKey(plan.key)} aria-pressed={active} className="mt-7 w-full">{active ? `${plan.name} selected` : `Select ${plan.name}`}</Button>
          </article>;
        })}</div>
      </section>}

      {features.length > 0 && <section aria-labelledby="comparison-heading" className="mt-14">
        <div className="flex items-center gap-2"><h2 id="comparison-heading" className="text-2xl font-semibold">Compare capabilities</h2><Info size={17} className="text-[var(--muted-foreground)]" aria-hidden="true" /></div>
        <div className="mt-5 divide-y divide-[var(--border)] border-y border-[var(--border)] sm:hidden">
          {features.map(feature => { const details = featurePresentation(feature); return <div key={feature} className="py-4"><p className="text-sm font-semibold">{details.label}</p>{details.description && <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">{details.description}</p>}<dl className="mt-3 grid grid-cols-2 gap-2 text-xs">{plans.map(plan => <div key={plan.key} className="flex items-center gap-1"><dt className="font-medium">{plan.name}:</dt><dd className={plan.features.includes(feature) ? "text-[var(--accent-strong)]" : "text-[var(--muted-foreground)]"}>{plan.features.includes(feature) ? "Included" : "Not included"}</dd></div>)}</dl></div>; })}
        </div>
        <div className="mt-5 hidden overflow-x-auto border-y border-[var(--border)] sm:block"><table className="w-full border-collapse text-sm"><thead><tr className="text-left"><th scope="col" className="w-1/2 py-4 font-semibold">Capability</th>{plans.map(plan => <th scope="col" key={plan.key} className="px-3 py-4 text-center font-semibold">{plan.name}</th>)}</tr></thead><tbody>{features.map(feature => { const details = featurePresentation(feature); return <tr key={feature} className="border-t border-[var(--border)]"><th scope="row" className="py-3 pr-4 text-left font-medium">{details.label}{details.description && <span className="mt-1 block text-xs font-normal leading-5 text-[var(--muted-foreground)]">{details.description}</span>}</th>{plans.map(plan => <td key={plan.key} className="px-3 py-3 text-center">{plan.features.includes(feature) ? <Check size={18} className="mx-auto text-[var(--accent-strong)]" aria-label="Included" /> : <span className="text-[var(--muted-foreground)]" aria-label="Not included">-</span>}</td>)}</tr>; })}</tbody></table></div>
        <p className="mt-3 text-xs leading-5 text-[var(--muted-foreground)]">A plan entitlement does not activate optional hardware, integrations or models; those also depend on service configuration and data readiness.</p>
      </section>}

      {selected && valid && <section aria-labelledby="next-heading" className="mt-14 border-t border-[var(--border)] pt-8"><div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">Your selection</p><h2 id="next-heading" className="mt-2 text-2xl font-semibold">{selected.name} for {count.toLocaleString("en-KE")} units</h2><p className="mt-2 text-sm text-[var(--muted-foreground)]">{money(selected.pricing.totalMinor, selected.pricing.currency)} due for the initial {months} months. Your agreement and issued invoice will confirm the final terms.</p></div><Link href={signupHref({ ...context, planKey: selected.key, unitCount: count, prepaidMonths: months })} onClick={() => void trackAcquisition("plan_selected", { ...context, planKey: selected.key })} className={buttonClassName({ className: "w-full sm:w-auto" })}>Continue with {selected.name} <ArrowRight size={16} /></Link></div><p className="mt-4 text-xs text-[var(--muted-foreground)]">Account and email verification, agreement review and signature, then secure payment. No property details are needed yet.</p></section>}

      {catalog.data && <section aria-labelledby="terms-heading" className="mt-12 border-t border-[var(--border)] pt-7"><h2 id="terms-heading" className="text-base font-semibold">Before you commit</h2><div className="mt-4 grid gap-x-10 gap-y-3 sm:grid-cols-2">{Object.values(catalog.data.terms).map(term => <p key={term} className="flex gap-2 text-sm leading-6 text-[var(--muted-foreground)]"><ChevronRight size={15} className="mt-1 shrink-0" aria-hidden="true" />{term}</p>)}</div></section>}
      <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-5 text-xs text-[var(--muted-foreground)]"><p>Journey analytics excludes contact details and payment credentials.</p><button type="button" className="underline underline-offset-4 disabled:opacity-60" disabled={paused} onClick={() => { pauseJourneyAnalytics(); setPaused(true); }}>{paused ? "Journey analytics paused" : "Pause journey analytics"}</button></footer>
    </div>
  </main>;
}

export default function PlansPage() {
  return <Suspense fallback={<main className="min-h-screen bg-[var(--background)] p-8" role="status">Loading plans...</main>}><PlanComparison /></Suspense>;
}
