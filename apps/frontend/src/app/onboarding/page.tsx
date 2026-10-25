"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  FileSignature,
  ShieldCheck,
  CreditCard,
  Building2,
  Download,
} from "lucide-react";
import { StatusBadge, Alert, Button, Input } from "@/components/ui";
import { PlanFeatureMatrix } from "@/components/plans/plan-feature-matrix";
import { publicPlanCatalog } from "@/lib/acquisition";
import { useOrganization } from "@/hooks/use-organization";
import {
  useLandlordProgress,
  useLandlordCommand,
} from "@/hooks/queries/use-landlord-onboarding";
import {
  landlordOnboardingClient as client,
  downloadArtifact,
  onboardingStepIndex,
  type LandlordProgress,
} from "@/lib/data/landlord-onboarding";

import { WorkflowPipeline } from "@/components/workflow-pipeline";
import { orderedWorkflow } from "@/lib/status";

const steps = [
  { label: "Organization", icon: Building2 },
  { label: "Plan & pricing", icon: ShieldCheck },
  { label: "Review & sign", icon: FileSignature },
  { label: "Invoice & payment", icon: CreditCard },
  { label: "Activated", icon: Check },
];
const money = (minor: number, currency = "KES") =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency }).format(
    minor / 100,
  );
function ArtifactButton({
  id,
  label,
}: {
  id?: string | undefined;
  label: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!id) return null;
  return (
    <div>
      <Button
        variant="outline"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await downloadArtifact(id);
          } catch (failure) {
            setError(
              failure instanceof Error
                ? failure.message
                : "Download failed. Try again.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <Download size={15} />
        {label}
      </Button>
      {error && <Alert tone="destructive">{error}</Alert>}
    </div>
  );
}
function GuidedOnboarding({
  org,
  progress,
}: {
  org: string;
  progress: LandlordProgress;
}) {
  const action = useLandlordCommand(org);
  const [legalName, setLegalName] = useState(
    progress.organization.legalName ?? progress.organization.name,
  );
  const [identifier, setIdentifier] = useState(
    progress.organization.legalIdentifier ?? "",
  );
  const [email, setEmail] = useState(progress.organization.billingEmail ?? "");
  const [units, setUnits] = useState(progress.organization.unitCount ?? 0);
  const [planKey, setPlanKey] = useState(
    progress.contract?.snapshot.planKey ??
      progress.organization.selectedPlanKey ??
      "CONTROL",
  );
  const [months, setMonths] = useState(
    progress.contract?.snapshot.prepaidMonths ??
      progress.organization.selectedPrepaidMonths ??
      3,
  );
  const [signatory, setSignatory] = useState(""),
    [authority, setAuthority] = useState(false),
    [accepted, setAccepted] = useState(false);
  const [replacementReason, setReplacementReason] = useState("");
  const [editingDetails, setEditingDetails] = useState(false);
  const catalog = useQuery({
    queryKey: ["onboarding-plan-catalog", progress.organization.unitCount ?? 0, months],
    queryFn: () => publicPlanCatalog(progress.organization.unitCount ?? 0, months),
    enabled: progress.nextStep === "PLAN" && !editingDetails,
  });
  const availablePlans = catalog.data?.plans ?? [];
  const selectedAvailable = availablePlans.some(plan => plan.key === planKey);
  const quote = useQuery({
    queryKey: ["landlord-quote", org, planKey, months, progress.revision],
    queryFn: () => client.quote(org, planKey, months),
    enabled: progress.nextStep === "PLAN" && selectedAvailable,
  });
  const pricing = progress.contract?.snapshot ?? quote.data,
    current = onboardingStepIndex(progress);
  const run = (fn: () => Promise<LandlordProgress>) => action.mutate(fn);
  function configure(event: FormEvent) {
    event.preventDefault();
    run(() =>
      client.configure(org, {
        legalName,
        legalIdentifier: identifier,
        billingEmail: email,
        unitCount: units,
        selectedPlanKey: planKey,
      }),
    );
  }
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-accent-foreground">
          Landlord onboarding
        </p>
        <h1 className="mt-2 text-3xl font-semibold">
          Activate your Command Center
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your progress is saved. Review your organization’s agreement, sign and
          pay the prepaid activation invoice.
        </p>
      </header>
      <WorkflowPipeline
        className="mb-8"
        label="Onboarding progress"
        domain="onboarding"
        stages={orderedWorkflow(
          steps.map((step) => step.label),
          current,
          progress.organization.attentionCode ?? progress.state,
        ).map((stage) =>
          stage.position === "current" &&
          progress.organization.attentionCode === "PAYMENT_FAILED"
            ? { ...stage, position: "failed" }
            : stage,
        )}
      />
      {action.error && (
        <Alert tone="destructive" className="mb-5">
          {action.error.message} Your saved progress is preserved.
        </Alert>
      )}
      {progress.organization.attentionCode && (
        <Alert
          tone={
            progress.organization.attentionCode === "PAYMENT_FAILED" ||
            progress.organization.attentionCode ===
              "CHECKOUT_PREPARATION_FAILED"
              ? "destructive"
              : "warning"
          }
          className="mb-5"
        >
          {progress.organization.attentionCode === "PAYMENT_FAILED"
            ? "Payment was unsuccessful. Use “Verify payment / recover checkout” to check the provider and safely retry."
            : "A payment or renewal step needs attention. Your agreement and invoice remain saved; verify the payment or contact support with your invoice number."}
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          {(progress.nextStep === "DETAILS" || (progress.nextStep === "PLAN" && editingDetails)) && (
            <form onSubmit={configure} className="space-y-5">
              <h2 className="text-xl font-semibold">
                Organization and portfolio
              </h2>
              <label className="block text-sm">
                Legal organization / landlord name
                <Input
                  required
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  maxLength={200}
                  className="mt-2"
                />
              </label>
              <label className="block text-sm">
                Registration number or legal identifier
                <Input
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  maxLength={100}
                  className="mt-2"
                />
              </label>
              <label className="block text-sm">
                Billing email
                <Input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2"
                />
              </label>
              <label className="block text-sm">
                Portfolio unit count
                <Input
                  required
                  type="number"
                  min={0}
                  max={100000}
                  value={units}
                  onChange={(e) => setUnits(Number(e.target.value))}
                  className="mt-2"
                />
              </label>
              <p className="text-xs text-muted-foreground">
                {progress.organization.pilotPrepared
                  ? "Your prepared property records stay in this workspace. This declared portfolio count determines the initial commercial terms."
                  : "This declared portfolio count determines the initial commercial terms. Your property records are created after activation."}
              </p>
              <Button type="submit" loading={action.isPending}>
                Save and continue
              </Button>
              {progress.nextStep === "PLAN" && <Button type="button" variant="outline" className="ml-3" onClick={() => setEditingDetails(false)}>Keep saved details</Button>}
            </form>
          )}
          {progress.nextStep === "PLAN" && !editingDetails && (
            <div>
              <h2 className="text-xl font-semibold">
                Choose your operating tier
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Pricing comes from the server and includes the saved portfolio
                of {progress.organization.unitCount} units.
              </p>
              <Button type="button" variant="link" className="mt-2 px-0" onClick={() => setEditingDetails(true)}>Edit organization and unit count</Button>
              {catalog.isPending && (
                <p className="mt-4" role="status">
                  Loading current plans...
                </p>
              )}
              {catalog.error && (
                <Alert tone="destructive">
                  {catalog.error.message}
                  <Button variant="link" onClick={() => void catalog.refetch()}>
                    Retry plans
                  </Button>
                </Alert>
              )}
              {catalog.data?.unavailablePlans?.map(plan => <Alert key={plan.key} tone="warning" className="mt-4">{plan.name}: {plan.reason}</Alert>)}
              {catalog.data && availablePlans.length === 0 && <Alert tone="warning" className="mt-4">No tier has a published quote for this portfolio. Contact support before continuing.</Alert>}
              {catalog.data && availablePlans.length > 0 && !selectedAvailable && <Alert tone="warning" className="mt-4">Your previously selected tier is not available for a new agreement. Choose one of the published plans below.</Alert>}
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {availablePlans.map((plan) => (
                    <button
                      key={plan.key}
                      type="button"
                      aria-pressed={plan.key === planKey}
                      onClick={() => setPlanKey(plan.key)}
                      className={`min-w-0 rounded-md border p-5 text-left transition-colors ${plan.key === planKey ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary"} ${plan.key === "FORT_KNOX" ? "bg-[#203b32] text-[#edf2ec]" : "bg-card"}`}
                    >
                      <span className={`text-xs font-semibold uppercase ${plan.key === "FORT_KNOX" ? "text-[#c7d9cc]" : "text-muted-foreground"}`}>{plan.key === "FORT_KNOX" ? "Advanced protection" : "Complete operations"}</span>
                      <h3 className="mt-2 text-xl font-semibold">{plan.name}</h3>
                      <p className="mt-4 text-2xl font-semibold tabular-nums">{money(plan.pricing.monthlyMinor, plan.pricing.currency)}<span className="ml-1 text-xs font-normal">/ month</span></p>
                      <dl className={`mt-5 space-y-2 border-t pt-4 text-xs ${plan.key === "FORT_KNOX" ? "border-[#4a6559]" : "border-border"}`}>
                        <div className="flex justify-between gap-2"><dt>Included units</dt><dd className="tabular-nums">{plan.pricing.includedUnits}</dd></div>
                        <div className="flex justify-between gap-2"><dt>Extra units</dt><dd className="tabular-nums">{plan.pricing.extraUnits} at {money(plan.pricing.additionalUnitMinor, plan.pricing.currency)}</dd></div>
                        <div className="flex justify-between gap-2 font-semibold"><dt>First {months} months</dt><dd className="tabular-nums">{money(plan.pricing.totalMinor, plan.pricing.currency)}</dd></div>
                      </dl>
                      <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold"><span aria-hidden="true" className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${plan.key === planKey ? "border-current" : "border-current/40"}`}>{plan.key === planKey && <Check size={13} />}</span>{plan.key === planKey ? "Selected" : `Select ${plan.name}`}</span>
                    </button>
                  ))}
              </div>
              {availablePlans.length > 0 && <a href="#onboarding-plan-comparison" className="mt-4 inline-block text-sm font-semibold underline underline-offset-4">Compare all Control and Fort Knox features</a>}
              <label className="mt-6 block text-sm">
                Initial prepaid term
                <select
                  value={months}
                  onChange={(e) => setMonths(Number(e.target.value))}
                  className="input mt-2"
                >
                  {[3, 6, 12, 24].map((term) => (
                    <option key={term} value={term}>
                      {term} months upfront
                    </option>
                  ))}
                </select>
              </label>
              {quote.error && (
                <Alert tone="destructive" className="mt-4">
                  {quote.error.message}
                  <Button variant="link" onClick={() => void quote.refetch()}>
                    Retry pricing
                  </Button>
                </Alert>
              )}
              {selectedAvailable && quote.isPending && <p className="mt-5 text-sm text-muted-foreground" role="status">Calculating your current quote...</p>}
              {selectedAvailable && quote.data && <div className="mt-5 border-y border-border py-5" aria-live="polite">
                <h3 className="text-sm font-semibold">Current server quote</h3>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-muted-foreground">Included units</dt><dd className="font-medium tabular-nums">{quote.data.includedUnits}</dd></div>
                  <div><dt className="text-muted-foreground">Additional units</dt><dd className="font-medium tabular-nums">{quote.data.extraUnits} at {money(quote.data.additionalUnitMinor, quote.data.currency)} per unit / month</dd></div>
                  <div><dt className="text-muted-foreground">Base / month</dt><dd className="font-medium tabular-nums">{money(quote.data.baseMonthlyMinor, quote.data.currency)}</dd></div>
                  <div><dt className="text-muted-foreground">Monthly equivalent</dt><dd className="font-medium tabular-nums">{money(quote.data.monthlyMinor, quote.data.currency)}</dd></div>
                  <div><dt className="text-muted-foreground">Due for {quote.data.prepaidMonths} months upfront</dt><dd className="font-semibold tabular-nums">{money(quote.data.totalMinor, quote.data.currency)}</dd></div>
                  <div><dt className="text-muted-foreground">Later {quote.data.billingCycle.toLowerCase()} cycle</dt><dd className="font-medium tabular-nums">{money(quote.data.recurringMinor, quote.data.currency)}</dd></div>
                </dl>
                <p className="mt-4 text-xs leading-5 text-muted-foreground">The generated agreement and invoice will confirm these terms. Hardware and installation are separate. No payment is taken at this step.</p>
              </div>}
              <Button
                className="mt-6"
                loading={action.isPending || quote.isFetching}
                disabled={!quote.data || !selectedAvailable || catalog.isFetching}
                onClick={() =>
                  run(() =>
                    client.generate(org, {
                      planKey,
                      prepaidMonths: months,
                      expectedRevision: progress.revision,
                    }),
                  )
                }
              >
                Generate contract and invoice
              </Button>
            </div>
          )}
          {progress.nextStep === "SIGNATURE" && progress.contract && (
            <div>
              <h2 className="text-xl font-semibold">
                Review your services agreement
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Template {progress.contract.templateId}, version{" "}
                {progress.contract.templateVersion}. This version and pricing
                are retained with your signature.
              </p>
              <article
                className="mt-5 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-background p-5 text-sm leading-7"
                tabIndex={0}
              >
                {progress.contract.body}
              </article>
              <div className="mt-4">
                <ArtifactButton
                  id={progress.contract.documentId}
                  label="Download contract PDF"
                />
              </div>
              <form
                className="mt-6 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  run(() =>
                    client.sign(org, {
                      contractId: progress.contract!._id,
                      documentHash: progress.contract!.sha256,
                      signatoryName: signatory,
                      authorityConfirmed: true,
                      termsAccepted: true,
                    }),
                  );
                }}
              >
                <label className="block text-sm">
                  Full signatory name (your electronic signature)
                  <Input
                    required
                    minLength={2}
                    maxLength={200}
                    value={signatory}
                    onChange={(e) => setSignatory(e.target.value)}
                    className="mt-2"
                  />
                </label>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    required
                    type="checkbox"
                    checked={authority}
                    onChange={(e) => setAuthority(e.target.checked)}
                  />
                  <span>
                    I confirm that I am authorized to enter this agreement for{" "}
                    {progress.organization.legalName}.
                  </span>
                </label>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    required
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                  />
                  <span>
                    I have reviewed the contract, accept its terms and consent
                    to use my typed name as an electronic signature.
                  </span>
                </label>
                <Button
                  type="submit"
                  loading={action.isPending}
                  disabled={
                    !authority || !accepted || signatory.trim().length < 2
                  }
                >
                  <FileSignature size={16} />
                  Sign and accept
                </Button>
              </form>
            </div>
          )}
          {progress.nextStep === "PAYMENT" && (
            <div>
              <h2 className="text-xl font-semibold">
                Pay your activation invoice
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Signed by {progress.contract?.signature?.name}. Access begins
                after backend payment verification.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">Payment opens in secure Paystack checkout. Available methods depend on your Paystack account and country.</p>
              <div className="mt-5 rounded-xl border border-border bg-background p-5">
                <p className="text-sm font-medium">
                  {progress.invoice?.invoiceNumber}
                </p>
                {pricing?.lineItems.map((line) => (
                  <div
                    key={line.description}
                    className="mt-4 flex justify-between gap-3 text-sm"
                  >
                    <span>
                      {line.description} × {line.quantity}
                    </span>
                    <span>{money(line.totalMinor, pricing.currency)}</span>
                  </div>
                ))}
                <div className="mt-5 flex justify-between border-t border-border pt-4 font-semibold">
                  <span>Amount due</span>
                  <span>
                    {money(pricing?.totalMinor ?? 0, pricing?.currency)}
                  </span>
                </div>
                {pricing && Number.isSafeInteger(pricing.recurringMinor) && <div className="mt-3 flex justify-between gap-3 text-sm text-muted-foreground"><span>Later {pricing.billingCycle.toLowerCase()} cycle</span><span className="tabular-nums">{money(pricing.recurringMinor, pricing.currency)}</span></div>}
                <p className="mt-3 text-xs text-muted-foreground">
                  Invoice status:{" "}
                  <StatusBadge
                    status={progress.invoice?.status}
                    domain="billing"
                  />{" "}
                  · Payment state:{" "}
                  <StatusBadge status={progress.state} domain="onboarding" />
                </p>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <ArtifactButton
                  id={progress.contract?.signedDocumentId}
                  label="Signed contract"
                />
                <ArtifactButton
                  id={progress.invoice?.documentId}
                  label="Invoice PDF"
                />
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                {progress.subscription?.providerCheckoutUrl ? (
                  <a
                    className="btn-primary"
                    href={progress.subscription.providerCheckoutUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open secure Paystack checkout
                  </a>
                ) : (
                  !progress.subscription?.providerCheckoutReference && (
                    <Button
                      loading={action.isPending}
                      onClick={() => run(() => client.checkout(org))}
                    >
                      Prepare secure checkout
                    </Button>
                  )
                )}
                {progress.subscription?.providerCheckoutReference && (
                  <Button
                    variant="secondary"
                    loading={action.isPending}
                    onClick={() => run(() => client.reconcile(org))}
                  >
                    Verify payment / recover checkout
                  </Button>
                )}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                You can safely leave and return. A checkout redirect never
                activates your account. Successful payments are reconciled by
                the provider webhook or a server verification.
              </p>
            </div>
          )}
          {progress.nextStep === "COMPLETE" && (
            <div>
              <ShieldCheck size={36} className="text-emerald-600" />
              <h2 className="mt-4 text-2xl font-semibold">
                Your Command Center is active
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Prepaid access runs until{" "}
                {progress.subscription?.currentPeriodEnd
                  ? new Date(
                      progress.subscription.currentPeriodEnd,
                    ).toLocaleDateString("en-KE")
                  : "your current term ends"}
                .{" "}
                {progress.organization.pilotPrepared
                  ? "Continue operating the portfolio prepared during your guided pilot."
                  : "You can now start property onboarding."}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <ArtifactButton
                  id={progress.contract?.signedDocumentId}
                  label="Signed agreement"
                />
                <ArtifactButton
                  id={progress.invoice?.documentId}
                  label="Invoice"
                />
                <ArtifactButton
                  id={progress.invoice?.receiptDocumentId}
                  label="Payment confirmation"
                />
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={
                    progress.organization.pilotPrepared
                      ? "/dashboard"
                      : "/get-started"
                  }
                  className="btn-primary"
                >
                  {progress.organization.pilotPrepared
                    ? "Open your Command Center"
                    : "Start guided property setup"}
                </Link>
                {progress.organization.pilotPrepared && (
                  <Link href="/properties" className="btn-secondary">
                    Manage properties
                  </Link>
                )}
                <Link
                  href="/property-onboarding-help"
                  className="btn-secondary"
                >
                  Request setup assistance
                </Link>
              </div>
              {progress.subscription?.renewalState === "REQUIRES_ATTENTION" && (
                <Alert className="mt-5">
                  Your upfront payment is verified. Support must review the
                  recurring payment authorization before the prepaid period
                  ends.
                </Alert>
              )}
            </div>
          )}
        </section>
        <aside className="h-fit rounded-2xl border border-border bg-card p-6">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">
            Activation summary
          </p>
          <dl className="mt-5 space-y-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Organization</dt>
              <dd className="mt-1 font-medium">
                {progress.organization.legalName ?? progress.organization.name}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Plan</dt>
              <dd>{pricing?.planName ?? "Choose a plan"}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Portfolio</dt>
              <dd>{progress.organization.unitCount ?? units} units</dd>
            </div>
            <div className="flex justify-between">
              <dt>Monthly equivalent</dt>
              <dd>
                {pricing
                  ? money(pricing.monthlyMinor, pricing.currency)
                  : "Pending"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Prepaid term</dt>
              <dd>{pricing?.prepaidMonths ?? months} months</dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt>Initial amount</dt>
              <dd>
                {pricing
                  ? money(pricing.totalMinor, pricing.currency)
                  : "Pending"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Later billing cycle</dt>
              <dd>{pricing ? Number.isSafeInteger(pricing.recurringMinor) ? `${pricing.billingCycle} · ${money(pricing.recurringMinor, pricing.currency)}` : "Review agreement" : "Selected plan"}</dd>
            </div>
          </dl>
          <p className="mt-6 rounded-xl bg-muted p-4 text-xs leading-5 text-muted-foreground">
            Minimum initial commitment: 3 months. Contract and invoice totals
            are fixed when generated. Hardware and installation are separate.
          </p>
          {progress.contract &&
            !progress.subscription?.providerCheckoutReference &&
            current < 4 && (
              <details className="mt-6 text-sm">
                <summary className="cursor-pointer">
                  Correct the agreement before payment
                </summary>
                <p className="mt-3 text-xs text-muted-foreground">
                  A replacement preserves the old contract and voids its unpaid
                  invoice. The replacement must be reviewed and signed again.
                </p>
                <label className="mt-3 block">
                  Correct legal name
                  <Input
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                  />
                </label>
                <label className="mt-3 block">
                  Legal identifier
                  <Input
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                  />
                </label>
                <label className="mt-3 block">
                  Billing email
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label className="mt-3 block">
                  Unit count
                  <Input
                    type="number"
                    min={0}
                    max={100000}
                    value={units}
                    onChange={(e) => setUnits(Number(e.target.value))}
                  />
                </label>
                <Input
                  aria-label="Replacement reason"
                  value={replacementReason}
                  onChange={(e) => setReplacementReason(e.target.value)}
                  placeholder="Explain the required correction"
                  className="mt-3"
                />
                <Button
                  variant="outline"
                  className="mt-3"
                  disabled={replacementReason.trim().length < 10}
                  loading={action.isPending}
                  onClick={() =>
                    run(() =>
                      client.replace(org, {
                        planKey: progress.contract!.snapshot.planKey,
                        prepaidMonths:
                          progress.contract!.snapshot.prepaidMonths,
                        expectedRevision: progress.revision,
                        reason: replacementReason,
                        details: {
                          legalName,
                          legalIdentifier: identifier,
                          billingEmail: email,
                          unitCount: units,
                        },
                      }),
                    )
                  }
                >
                  Create audited replacement
                </Button>
              </details>
            )}
        </aside>
      </div>
      {progress.nextStep === "PLAN" && !editingDetails && availablePlans.length > 0 && <section id="onboarding-plan-comparison" className="mt-10 min-w-0 scroll-mt-6" aria-labelledby="onboarding-comparison-heading">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase text-muted-foreground">Feature comparison</p><h2 id="onboarding-comparison-heading" className="mt-1 text-2xl font-semibold">Control vs Fort Knox</h2></div><p className="max-w-md text-sm text-muted-foreground">Both tiers share the operational foundation. Highlighted capabilities are additions in the currently published Fort Knox tier.</p></div>
        <PlanFeatureMatrix plans={availablePlans} />
        <p className="mt-4 text-xs leading-5 text-muted-foreground">Entitlement does not replace role and property permissions. CCTV requires configured hardware and a streaming gateway; intelligence depends on data and model readiness. Your signed agreement defines support commitments.</p>
      </section>}
    </div>
  );
}
export default function LandlordOnboardingPage() {
  const { activeOrganizationId, refreshOrganizations } = useOrganization(),
    progress = useLandlordProgress(activeOrganizationId ?? undefined);
  const router = useRouter(),
    recovered = useRef(false),
    redirected = useRef(false),
    recovery = useLandlordCommand(activeOrganizationId ?? "");
  useEffect(() => {
    if (!activeOrganizationId || !progress.data) return;
    const query = new URLSearchParams(window.location.search);
    if (
      progress.data.nextStep === "COMPLETE" &&
      query.get("review") !== "1" &&
      !redirected.current
    ) {
      redirected.current = true;
      void refreshOrganizations().then(() => router.replace("/get-started"));
    } else if (
      progress.data.nextStep === "PAYMENT" &&
      (query.has("reference") || query.has("trxref")) &&
      !recovered.current
    ) {
      recovered.current = true;
      // The return URL only requests reconciliation; saved backend/provider records decide activation.
      recovery.mutate(() => client.reconcile(activeOrganizationId));
    }
  }, [
    activeOrganizationId,
    progress.data,
    refreshOrganizations,
    router,
    recovery,
  ]);
  if (!activeOrganizationId)
    return (
      <main className="min-h-screen bg-muted p-8">
        <div className="mx-auto max-w-xl rounded-xl border border-border bg-card p-8">
          <h1 className="text-2xl font-semibold">Finish your landlord setup</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Sign in with your organization owner account.
          </p>
          <Link href="/login" className="btn-primary mt-5 inline-flex">
            Go to sign in
          </Link>
        </div>
      </main>
    );
  if (progress.isLoading)
    return (
      <main className="p-10" role="status">
        Restoring your saved onboarding progress…
      </main>
    );
  if (progress.error || !progress.data)
    return (
      <main className="p-10">
        <Alert tone="destructive">
          {progress.error?.message ?? "Progress could not be loaded."}
          <Button variant="link" onClick={() => void progress.refetch()}>
            Retry
          </Button>
        </Alert>
      </main>
    );
  return (
    <main className="min-h-screen bg-muted px-4 py-8 sm:px-8">
      {recovery.error && (
        <Alert tone="destructive">
          {recovery.error.message} Your saved progress is preserved. Use the
          payment verification button to retry.
        </Alert>
      )}
      <GuidedOnboarding
        key={`${activeOrganizationId}:${progress.data.revision}`}
        org={activeOrganizationId}
        progress={progress.data}
      />
    </main>
  );
}
