"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { Alert, Button, Input } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import {
  parseSignupContext,
  pauseJourneyAnalytics,
  publicPlanCatalog,
  signupHref,
  trackAcquisition,
} from "@/lib/acquisition";

const money = (minor: number, currency = "KES") =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency }).format(
    minor / 100,
  );
function PlanComparison() {
  const search = useSearchParams(),
    context = parseSignupContext(search.toString());
  const [units, setUnits] = useState(String(context.unitCount)),
    [months, setMonths] = useState(context.prepaidMonths);
  const [paused, setPaused] = useState(false);
  const count = Number(units),
    valid =
      units !== "" && Number.isInteger(count) && count >= 0 && count <= 100000;
  const catalog = useQuery({
    queryKey: ["public-plan-catalog", count, months],
    queryFn: () => publicPlanCatalog(count, months),
    enabled: valid,
  });
  return (
    <main className="min-h-screen bg-muted px-4 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <nav className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="font-semibold">
            {BRAND.name}
          </Link>
          <div className="flex gap-5 text-sm">
            <Link href="/demo">Explore the demonstration</Link>
            <Link href="/login?next=%2Fonboarding">Sign in and resume</Link>
          </div>
        </nav>
        <header className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-widest text-accent-foreground">
            Your portfolio, your pace
          </p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
            Choose your Property Command Center
          </h1>
          <p className="mt-4 text-muted-foreground">
            Compare the exact server-calculated subscription price. Create an
            account, verify your email, then review the agreement and pay. Add
            your property records after activation.
          </p>
        </header>
        <section className="mt-8 flex flex-wrap gap-6 rounded-xl border border-border bg-card p-5">
          <label className="text-sm font-medium">
            Planned portfolio units
            <Input
              aria-label="Planned portfolio units"
              type="number"
              min={0}
              max={100000}
              value={units}
              onChange={(event) => setUnits(event.target.value)}
              className="mt-2 w-44"
            />
          </label>
          <label className="text-sm font-medium">
            Initial prepaid term
            <select
              aria-label="Initial prepaid term"
              className="input mt-2 block"
              value={months}
              onChange={(event) => setMonths(Number(event.target.value))}
            >
              {[3, 6, 12, 24].map((term) => (
                <option key={term} value={term}>
                  {term} months upfront
                </option>
              ))}
            </select>
          </label>
          <p className="max-w-sm self-center text-sm text-muted-foreground">
            Only the planned unit count is needed for pricing. No property
            address, building or tenant information is required before purchase.
          </p>
        </section>
        {!valid && (
          <Alert tone="destructive" className="mt-5">
            Enter a whole unit count between 0 and 100,000.
          </Alert>
        )}
        {catalog.isLoading && (
          <p className="mt-8" role="status">
            Loading current subscription prices…
          </p>
        )}
        {catalog.error && (
          <Alert tone="destructive" className="mt-8">
            {catalog.error.message}
            <Button variant="link" onClick={() => void catalog.refetch()}>
              Retry prices
            </Button>
          </Alert>
        )}
        {catalog.data?.plans.length === 0 && (
          <Alert className="mt-8">
            Subscription prices are not published yet. Please return when the
            plans are available.
          </Alert>
        )}
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {catalog.data?.plans.map((plan) => (
            <article
              key={plan.key}
              className="rounded-2xl border border-border bg-card p-6 sm:p-8"
            >
              <p className="text-xs font-bold uppercase tracking-widest text-accent-foreground">
                {plan.name}
              </p>
              <h2 className="mt-4 text-3xl font-semibold">
                {money(plan.pricing.monthlyMinor, plan.pricing.currency)}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  / month equivalent
                </span>
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {plan.description}
              </p>
              <dl className="mt-6 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt>Included units</dt>
                  <dd>{plan.pricing.includedUnits}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Additional-unit price</dt>
                  <dd>
                    {money(plan.pricing.additionalUnitMinor)} / unit / month
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Additional units in this quote</dt>
                  <dd>{plan.pricing.extraUnits}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Later billing cycle</dt>
                  <dd>{plan.pricing.billingCycle.toLowerCase()}</dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-border pt-4 font-semibold">
                  <dt>{months} months upfront</dt>
                  <dd>{money(plan.pricing.totalMinor)}</dd>
                </div>
              </dl>
              <ul className="mt-6 grid gap-2 text-sm">
                {plan.features.slice(0, 8).map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <Check size={15} className="shrink-0" />
                    {feature.replaceAll("_", " ").replaceAll(".", " ")}
                  </li>
                ))}
              </ul>
              <Link
                className="btn-primary mt-7 inline-flex w-full justify-center"
                href={signupHref({
                  ...context,
                  planKey: plan.key,
                  unitCount: count,
                  prepaidMonths: months,
                })}
                onClick={() =>
                  void trackAcquisition("plan_selected", {
                    ...context,
                    planKey: plan.key,
                  })
                }
              >
                Continue with {plan.name}
                <ArrowRight size={16} />
              </Link>
            </article>
          ))}
        </div>
        {catalog.data && (
          <section className="mt-8 rounded-xl border border-border bg-card p-6 text-sm leading-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <ShieldCheck size={18} />
              Clear terms before payment
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {Object.values(catalog.data.terms).map((term) => (
                <p key={term} className="text-muted-foreground">
                  {term}
                </p>
              ))}
            </div>
            <p className="mt-4">
              The final signed agreement and issued invoice fix your price and
              commitment. Optional integrations can remain disabled.
            </p>
          </section>
        )}
        <footer className="mt-8 flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
          <p>
            Journey analytics records milestones without contact details,
            payment credentials or tenant records.
          </p>
          <button
            type="button"
            className="underline"
            disabled={paused}
            onClick={() => {
              pauseJourneyAnalytics();
              setPaused(true);
            }}
          >
            {paused ? "Journey analytics paused" : "Pause journey analytics"}
          </button>
        </footer>
      </div>
    </main>
  );
}
export default function PlansPage() {
  return (
    <Suspense
      fallback={
        <main className="p-8" role="status">
          Loading plans…
        </main>
      }
    >
      <PlanComparison />
    </Suspense>
  );
}
