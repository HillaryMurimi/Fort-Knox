"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { ArrowDown, ArrowRight, Check, ChevronRight, Minus, Plus, ShieldCheck, SunMoon } from "lucide-react";
import { Alert, Button, Input, Skeleton, buttonClassName } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import {
  parseSignupContext, pauseJourneyAnalytics, publicPlanCatalog,
  signupHref, trackAcquisition, type AcquisitionPlanKey, type PublicPlanCatalog,
} from "@/lib/acquisition";
import { comparisonCategories, planHighlights, featurePresentation } from "@/lib/plans-view-model";
import "./plans.css";

const money = (minor: number, currency = "KES") =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency }).format(minor / 100);

function Availability({ plan, feature }: { plan: PublicPlanCatalog["plans"][number]; feature: string | null }) {
  if (feature === null) return <span className="plans-availability plans-availability--terms">Per agreement</span>;
  if (!plan.features.includes(feature)) return <span className="plans-availability plans-availability--absent">Not included</span>;
  return <span className="plans-availability plans-availability--included"><Check size={14} aria-hidden="true" />Included</span>;
}

function PlanComparison() {
  const { resolvedTheme, setTheme } = useTheme();
  const search = useSearchParams();
  const context = parseSignupContext(search.toString());
  const [units, setUnits] = useState(String(search.has("units") ? context.unitCount : 50));
  const [months, setMonths] = useState(context.prepaidMonths);
  const [selectedKey, setSelectedKey] = useState<AcquisitionPlanKey>(context.planKey);
  const [paused, setPaused] = useState(false);
  const count = Number(units);
  const valid = units !== "" && Number.isInteger(count) && count >= 0 && count <= 100000;
  const catalog = useQuery({
    queryKey: ["public-plan-catalog", count, months],
    queryFn: () => publicPlanCatalog(count, months),
    enabled: valid,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const plans = valid && !catalog.isFetching && !catalog.isError ? catalog.data?.plans ?? [] : [];
  const selected = plans.find(plan => plan.key === selectedKey);
  const categories = comparisonCategories(plans);
  const selection = selected && { ...context, planKey: selected.key, unitCount: count, prepaidMonths: months };

  return <main className="plans-page" id="main-content">
    <header className="plans-hero">
      <div className="plans-shell">
        <nav className="plans-nav" aria-label="Plans navigation">
          <Link href="/" className="plans-wordmark">{BRAND.name}<span>PROPERTY COMMAND CENTER</span></Link>
          <div className="plans-nav-links">
            <Link href="/demo">Explore demo</Link>
            <Link href="/login?next=%2Fonboarding">Resume setup <ArrowRight size={15} aria-hidden="true" /></Link>
            <button type="button" className="plans-theme-toggle" title="Toggle light and dark theme" aria-label="Toggle light and dark theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}><SunMoon size={17} aria-hidden="true" /></button>
          </div>
        </nav>
        <div className="plans-hero-copy">
          <p className="plans-eyebrow">DAPINNI / SUBSCRIPTIONS</p>
          <h1>Choose Your Level of Property Command.</h1>
          <p>Professional property management built for investors who demand visibility, accountability, and control.</p>
          <a className="plans-hero-link" href="#quote">Build your quote <ArrowDown size={17} aria-hidden="true" /></a>
        </div>
      </div>
    </header>

    <section id="quote" className="plans-quote-band" aria-labelledby="quote-heading">
      <div className="plans-shell plans-quote-layout">
        <div>
          <p className="plans-eyebrow">YOUR PORTFOLIO</p>
          <h2 id="quote-heading">How Many Rental Units Do You Manage?</h2>
          <p>Choose the portfolio size you intend to manage. Both tiers are available at every size.</p>
        </div>
        <div className="plans-quote-controls">
          <div>
            <label htmlFor="planned-units">Planned units</label>
            <div className="plans-stepper">
              <Button type="button" variant="outline" size="icon" aria-label="Remove one unit" disabled={!valid || count === 0} onClick={() => setUnits(String(count - 1))}><Minus size={16} /></Button>
              <Input id="planned-units" type="number" inputMode="numeric" min={0} max={100000} step={1} value={units} onChange={event => setUnits(event.target.value)} aria-invalid={!valid} className="plans-unit-input" />
              <Button type="button" variant="outline" size="icon" aria-label="Add one unit" disabled={!valid || count === 100000} onClick={() => setUnits(String(count + 1))}><Plus size={16} /></Button>
            </div>
          </div>
          <div>
            <label htmlFor="prepaid-term">Initial commitment</label>
            <select id="prepaid-term" value={months} onChange={event => setMonths(Number(event.target.value))}>
              {[3, 6, 12, 24].map(term => <option key={term} value={term}>{term} months upfront</option>)}
            </select>
          </div>
          <p className="plans-quote-status" role="status" aria-live="polite">{catalog.isFetching ? "Updating current prices..." : valid ? "Server-calculated prices" : "Enter a valid unit count"}</p>
        </div>
      </div>
      {!valid && <div className="plans-shell"><Alert tone="destructive" className="mt-4">Enter a whole unit count from 0 to 100,000.</Alert></div>}
    </section>

    <div className="plans-shell plans-main">
      <section aria-labelledby="tiers-heading">
        <div className="plans-section-heading">
          <div><p className="plans-eyebrow">TWO LEVELS / ONE COMMAND CENTER</p><h2 id="tiers-heading">Choose your level of control</h2></div>
          <p>Fort Knox extends Control with security and advanced oversight. Neither tier is determined by unit count.</p>
        </div>
        {catalog.isFetching && valid && <div className="plans-tier-grid" role="status" aria-label="Loading current prices">{[0, 1].map(index => <Skeleton key={index} className="plans-tier-skeleton" />)}</div>}
        {catalog.isError && <Alert tone="destructive"><div className="flex flex-wrap items-center gap-3"><span>{catalog.error.message}</span><Button variant="outline" size="sm" onClick={() => void catalog.refetch()}>Retry prices</Button></div></Alert>}
        {catalog.data && !catalog.isFetching && plans.length === 0 && <Alert>No subscription tier currently has a published price. Please contact us before proceeding.</Alert>}
        {catalog.data?.unavailablePlans?.map(plan => <Alert key={plan.key} tone="warning" className="mb-4">{plan.name}: {plan.reason}</Alert>)}
        {plans.length > 0 && <div className="plans-tier-grid">{plans.map(plan => {
          const price = plan.pricing;
          const active = plan.key === selectedKey;
          const fort = plan.key === "FORT_KNOX";
          return <article key={plan.key} className={`plans-tier ${fort ? "plans-tier--fort" : "plans-tier--control"} ${active ? "plans-tier--selected" : ""}`}>
            <div className="plans-tier-top">
              <span className="plans-tier-icon"><ShieldCheck size={20} aria-hidden="true" /></span>
              <span>{fort ? "ADVANCED SECURITY + INTELLIGENCE" : "INTELLIGENT PROPERTY OPERATIONS"}</span>
            </div>
            <h3>{plan.name}</h3>
            <p className="plans-tier-tagline">{fort ? "Total Operational Command. Advanced Protection." : "Complete Command Over Your Property Operations."}</p>
            <div className="plans-tier-price">
              <p>For {count.toLocaleString("en-KE")} units</p>
              <strong aria-live="polite">{money(price.monthlyMinor, price.currency)}</strong>
              <span>monthly equivalent</span>
            </div>
            <dl className="plans-price-breakdown">
              <div><dt>Starting base / month</dt><dd>{money(price.baseMonthlyMinor, price.currency)}</dd></div>
              <div><dt>Included units</dt><dd>{price.includedUnits.toLocaleString("en-KE")}</dd></div>
              <div><dt>Additional units</dt><dd>{price.extraUnits.toLocaleString("en-KE")}</dd></div>
              <div><dt>Per additional unit / month</dt><dd>{money(price.additionalUnitMinor, price.currency)}</dd></div>
              <div className="plans-price-breakdown-total"><dt>Due for first {months} months</dt><dd>{money(price.totalMinor, price.currency)}</dd></div>
              <div><dt>Later {price.billingCycle.toLowerCase()} cycle</dt><dd>{money(price.recurringMinor, price.currency)}</dd></div>
            </dl>
            <div className="plans-tier-capabilities"><p>Included capabilities</p><ul>{planHighlights(plan).map(feature => <li key={feature}><Check size={15} aria-hidden="true" />{featurePresentation(feature).label}</li>)}</ul></div>
            <Button type="button" variant={active ? "default" : "outline"} aria-pressed={active} onClick={() => setSelectedKey(plan.key)} className={`plans-select ${fort ? "plans-select--fort" : ""}`}>{active ? `${plan.name} selected` : `Select ${plan.name}`}</Button>
          </article>;
        })}</div>}
        {plans.length > 0 && <p className="plans-disclosure">CCTV software access requires supported equipment and a configured gateway. Hardware, installation and provider costs are separate. Intelligence capabilities also depend on data and service readiness.</p>}
      </section>

      {plans.length > 0 && <section className="plans-comparison" aria-labelledby="comparison-heading">
        <div className="plans-section-heading"><div><p className="plans-eyebrow">CAPABILITIES</p><h2 id="comparison-heading">Compare what matters</h2></div><p>Features follow the current plan catalog. Access also depends on your role, configuration and service readiness.</p></div>
        <div className="plans-comparison-desktop"><table><thead><tr><th scope="col">Capability</th>{plans.map(plan => <th scope="col" key={plan.key}>{plan.name}</th>)}</tr></thead><tbody>{categories.map(category => <FragmentCategory key={category.title} category={category} plans={plans} />)}</tbody></table></div>
        <div className="plans-comparison-mobile">{categories.map(category => <section key={category.title} className="plans-mobile-category"><h3>{category.title}</h3>{category.rows.map(row => <div key={row.label} className="plans-mobile-row"><p>{row.label}<small>{row.description}</small></p><dl>{plans.map(plan => <div key={plan.key}><dt>{plan.name}</dt><dd><Availability plan={plan} feature={row.feature} /></dd></div>)}</dl></div>)}</section>)}</div>
      </section>}
    </div>

    <section className="plans-value" aria-labelledby="value-heading"><div className="plans-shell"><p className="plans-eyebrow">BUILT FOR SERIOUS PORTFOLIOS</p><h2 id="value-heading">Operational clarity at every level.</h2><div className="plans-value-grid"><div><span>01 / CONTROL</span><h3>Run the property business from one place.</h3><p>Replace fragmented records with connected property, tenant, rent and maintenance workflows. Know what is due, what needs attention and who is responsible.</p></div><div><span>02 / FORT KNOX</span><h3>See further into operational risk.</h3><p>Keep the Control foundation and add entitled security, evidence and oversight capabilities for portfolios that need closer monitoring.</p></div></div></div></section>

    <div className="plans-shell plans-bottom">
      {selection && <section className="plans-next" aria-labelledby="next-heading"><div><p className="plans-eyebrow">YOUR SELECTION</p><h2 id="next-heading">{selected.name} for {count.toLocaleString("en-KE")} units</h2><p>{money(selected.pricing.totalMinor, selected.pricing.currency)} due for the first {months} months. Your signed agreement and invoice confirm the final terms.</p></div><Link href={signupHref(selection)} onClick={() => void trackAcquisition("plan_selected", selection)} className={buttonClassName({ className: "plans-continue" })}>Continue with {selected.name} <ArrowRight size={17} aria-hidden="true" /></Link></section>}
      {catalog.data && <section className="plans-terms" aria-labelledby="terms-heading"><h2 id="terms-heading">Before you commit</h2><div>{Object.entries(catalog.data.terms).map(([name, term]) => <p key={name}><ChevronRight size={16} aria-hidden="true" />{term}</p>)}</div></section>}
      <footer className="plans-footer"><p>Account and email verification, agreement review, then secure payment. No property details are needed yet.</p><button type="button" disabled={paused} onClick={() => { pauseJourneyAnalytics(); setPaused(true); }}>{paused ? "Journey analytics paused" : "Pause journey analytics"}</button></footer>
    </div>
  </main>;
}

function FragmentCategory({ category, plans }: { category: ReturnType<typeof comparisonCategories>[number]; plans: PublicPlanCatalog["plans"] }) {
  return <><tr className="plans-category-row"><th scope="rowgroup" colSpan={plans.length + 1}>{category.title}</th></tr>{category.rows.map(row => <tr key={row.label}><th scope="row">{row.label}<span>{row.description}</span></th>{plans.map(plan => <td key={plan.key}><Availability plan={plan} feature={row.feature} /></td>)}</tr>)}</>;
}

export default function PlansPage() {
  return <Suspense fallback={<main className="plans-page p-8" role="status">Loading plans...</main>}><PlanComparison /></Suspense>;
}
