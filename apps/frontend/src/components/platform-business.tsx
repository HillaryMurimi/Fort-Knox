"use client";
import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  ArrowUpRight,
  RefreshCw,
  Sunrise,
  ChartNoAxesCombined,
  ShieldCheck,
} from "lucide-react";
import { StatusBadge,
  Alert,
  Badge,
  Button,
  Card,
  Input,
  Label,
  Select,
  Skeleton,
} from "@/components/ui";
import { usePlatformSearch } from "@/hooks/use-platform-search";
import { useAuth } from "@/hooks/use-auth";
import {
  businessOverviewSchema,
  platformBriefSchema,
  platformAnalyticsResponseError,
} from "@/lib/data/platform-business.contract";
import {
  usePlatformBusiness,
  useBusinessDrill,
  useBriefHistory,
  useHistoricalBrief,
  useGenerateBrief,
} from "@/hooks/queries/use-platform-business";
import {
  businessPeriods,
  businessLabel,
  businessMoney,
  businessPercent,
  type BusinessFilters,
  type BusinessOverview,
  type BusinessAction,
  type DrillKind,
  type PlatformBrief,
} from "@/lib/data/platform-business";
const defaults: BusinessFilters = {
  period: "TODAY",
  timeZone: "Africa/Nairobi",
  plan: "ALL",
  dataset: "LIVE",
};
const metricClass =
  "rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-muted";
function Kpi({
  title,
  value,
  detail,
  onClick,
}: {
  title: string;
  value: ReactNode;
  detail: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={metricClass}
      onClick={onClick}
      disabled={!onClick}
    >
      <span className="block text-xs text-muted-foreground">{title}</span>
      <span className="my-2 block text-2xl font-semibold tracking-tight">
        {value}
      </span>
      <span className="block text-xs text-muted-foreground">{detail}</span>
    </button>
  );
}
export function BusinessFiltersBar({
  filters,
  onChange,
}: {
  filters: BusinessFilters;
  onChange: (next: BusinessFilters) => void;
}) {
  return (
    <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4">
      <div>
        <Label htmlFor="business-plan">Plan</Label>
        <Select
          id="business-plan"
          value={filters.plan}
          onChange={(e) =>
            onChange({
              ...filters,
              plan: e.target.value as BusinessFilters["plan"],
            })
          }
        >
          {["ALL", "CONTROL", "FORT_KNOX", "OTHER", "UNASSIGNED"].map(
            (value) => (
              <option key={value} value={value}>
                {value === "ALL" ? "All plans" : businessLabel(value)}
              </option>
            ),
          )}
        </Select>
      </div>
      <div>
        <Label htmlFor="business-period">Operating period</Label>
        <Select
          id="business-period"
          value={filters.period}
          onChange={(e) => {
            const { from, to, ...rest } = filters;
            void from;
            void to;
            onChange({
              ...rest,
              period: e.target.value as BusinessFilters["period"],
            });
          }}
        >
          {businessPeriods.map((value) => (
            <option key={value} value={value}>
              {businessLabel(value)}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="business-timezone">Reporting timezone</Label>
        <Input
          id="business-timezone"
          value={filters.timeZone}
          onChange={(e) => onChange({ ...filters, timeZone: e.target.value })}
          list="business-zones"
        />
        <datalist id="business-zones">
          <option>Africa/Nairobi</option>
          <option>UTC</option>
          <option>Europe/London</option>
          <option>America/New_York</option>
        </datalist>
      </div>
      <div>
        <Label htmlFor="business-dataset">Record dataset</Label>
        <Select
          id="business-dataset"
          value={filters.dataset}
          onChange={(e) =>
            onChange({
              ...filters,
              dataset: e.target.value as BusinessFilters["dataset"],
            })
          }
        >
          <option value="LIVE">Live records</option>
          {process.env.NODE_ENV !== "production" && (
            <option value="DEMO">Simulated demo records</option>
          )}
        </Select>
      </div>
      {filters.period === "CUSTOM" && (
        <>
          <div>
            <Label htmlFor="business-from">From (inclusive)</Label>
            <Input
              id="business-from"
              type="date"
              value={filters.from ?? ""}
              onChange={(e) => onChange({ ...filters, from: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="business-to">To (inclusive)</Label>
            <Input
              id="business-to"
              type="date"
              value={filters.to ?? ""}
              onChange={(e) => onChange({ ...filters, to: e.target.value })}
            />
          </div>
        </>
      )}
    </div>
  );
}
export function PriorityActions({
  actions,
  truncated = false,
}: {
  actions: BusinessAction[];
  truncated?: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Priority action queue</h3>
        <Badge>{actions.length} actions</Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Deterministic rules and recorded monitoring severity. Critical → High →
        Medium → Informational.
      </p>
      {!actions.length && (
        <p className="py-5 text-sm text-muted-foreground">
          No priority actions in the available sources. This does not certify
          unobserved services.
        </p>
      )}
      <ol className="mt-4 space-y-2">
        {actions.map((action) => (
          <li key={action.id}>
            <a
              href={action.href}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted"
            >
              <div className="flex items-start gap-3">
                <StatusBadge status={action.severity} domain="predictive">
                  {businessLabel(action.severity)}
                </StatusBadge>
                <div>
                  <p className="text-sm font-medium">{action.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {action.category}
                    {action.plan && action.plan !== "ALL"
                      ? " · " + businessLabel(action.plan)
                      : ""}{" "}
                    · {action.count} affected{" "}
                    {action.organizationId ? "· " + action.organizationId : ""}
                  </p>
                </div>
              </div>
              <ArrowUpRight size={16} aria-hidden />
            </a>
          </li>
        ))}
      </ol>
      {truncated && (
        <Alert tone="warning" className="mt-4">
          The queue is capped. Use the linked filtered screens for every
          affected record.
        </Alert>
      )}
    </Card>
  );
}
export function PlanPerformanceView({
  data,
  onDrill,
}: {
  data: BusinessOverview;
  onDrill: (kind: DrillKind, plan?: BusinessFilters["plan"]) => void;
}) {
  const result = businessOverviewSchema.safeParse(data);
  if (!result.success)
    return <Alert tone="destructive">{platformAnalyticsResponseError}</Alert>;
  return <ValidPlanPerformanceView data={result.data} onDrill={onDrill} />;
}
function ValidPlanPerformanceView({
  data,
  onDrill,
}: {
  data: BusinessOverview;
  onDrill: (kind: DrillKind, plan?: BusinessFilters["plan"]) => void;
}) {
  const [currency, setCurrency] = useState("KES");
  const currencies = [...new Set(data.revenue.map((row) => row.currency))],
    selectedCurrency = currencies.includes(currency)
      ? currency
      : (currencies[0] ?? "KES");
  const moneyRows = data.revenue.filter(
      (row) => row.currency === selectedCurrency,
    ),
    sum = (
      field:
        | "mrrMinor"
        | "arrMinor"
        | "invoicedMinor"
        | "collectedMinor"
        | "outstandingMinor"
        | "overdueMinor",
    ) => moneyRows.reduce((total, row) => total + row[field], 0);
  const total = (
    key:
      | "activeOrganizations"
      | "organizations"
      | "stuckOnboarding"
      | "awaitingSignature"
      | "awaitingPayment"
      | "properties"
      | "units"
      | "requiresAttention"
      | "subscriptionsMissingPrice",
  ) => data.plans.reduce((n, p) => n + p[key], 0);
  const missing = data.unavailableSources.includes(
      "organizations/subscriptions/portfolio",
    ),
    billingMissing = data.unavailableSources.includes(
      "invoices/verified-payment-events",
    );
  const daily = useMemo(() => {
    const days = new Map<
      string,
      { day: string; Control: number; FortKnox: number }
    >();
    for (const row of data.growth.daily) {
      const item = days.get(row.day) ?? {
        day: row.day,
        Control: 0,
        FortKnox: 0,
      };
      if (row.plan === "CONTROL") item.Control += row.signups;
      if (row.plan === "FORT_KNOX") item.FortKnox += row.signups;
      days.set(row.day, item);
    }
    return [...days.values()];
  }, [data.growth.daily]);
  return (
    <div className="space-y-5">
      {data.dataset === "DEMO" && (
        <Alert tone="warning">
          SIMULATED DEMO DATA. Payments and CCTV observations are fixtures,
          excluded from live metrics.
        </Alert>
      )}
      {data.unavailableSources.length > 0 && (
        <Alert tone="warning">
          Partial data: {data.unavailableSources.join(", ")}. Unavailable
          sources are not treated as healthy or empty.
        </Alert>
      )}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h3 className="text-sm font-semibold">Platform attention now</h3>
          <p className="text-xs text-muted-foreground">
            {data.actions.filter((a) => a.severity === "CRITICAL").length}{" "}
            critical priorities ·{" "}
            {data.actions.filter((a) => a.severity === "HIGH").length} high
            priorities ·{" "}
            {data.operations.filter((m) => m.value === null).length} operational
            indicators unavailable
          </p>
        </div>
        <a href="#platform-business-priorities" className="text-sm underline">
          Review priority actions
        </a>
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Current stocks as of{" "}
          {new Date(data.asOf).toLocaleString("en-KE", {
            timeZone: data.range.timeZone,
          })}{" "}
          · {data.range.timeZone}
        </span>
        <span>
          Flows:{" "}
          {new Date(data.range.from).toLocaleDateString("en-KE", {
            timeZone: data.range.timeZone,
          })}{" "}
          →{" "}
          {new Date(data.range.to).toLocaleDateString("en-KE", {
            timeZone: data.range.timeZone,
          })}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          title="Active organizations"
          value={missing ? "Unavailable" : total("activeOrganizations")}
          detail={`${total("organizations")} organizations in selected scope`}
          onClick={() => onDrill("ACTIVE")}
        />
        <Kpi
          title="Known contracted MRR"
          value={
            missing
              ? "Unavailable"
              : moneyRows.length
                ? businessMoney(sum("mrrMinor"), selectedCurrency)
                : "No price snapshots"
          }
          detail={`${total("subscriptionsMissingPrice")} active subscriptions lack pricing coverage`}
          onClick={() => onDrill("ACTIVE")}
        />
        <Kpi
          title="Known contracted ARR"
          value={
            missing
              ? "Unavailable"
              : moneyRows.length
                ? businessMoney(sum("arrMinor"), selectedCurrency)
                : "Unavailable"
          }
          detail="Normalized MRR × 12; prepaid cash is separate"
          onClick={() => onDrill("ACTIVE")}
        />
        <Kpi
          title="Onboarding needs attention"
          value={missing ? "Unavailable" : total("requiresAttention")}
          detail={`${total("stuckOnboarding")} unchanged beyond 72 hours`}
          onClick={() => onDrill("ATTENTION")}
        />
      </div>
      {currencies.length > 1 && (
        <div className="max-w-xs">
          <Label htmlFor="business-currency">Currency (no conversion)</Label>
          <Select
            id="business-currency"
            value={selectedCurrency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
      )}
      <Card className="overflow-hidden">
        <div className="border-b p-5">
          <h3 className="font-semibold">Control and Fort Knox performance</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Each plan is measured independently. Conversion uses the selected
            signup cohort; organizational states can overlap.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[950px] text-left text-sm">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                {[
                  "Plan",
                  "Organizations",
                  "Active",
                  "Onboarding",
                  "Suspended / cancelled",
                  "Units / active",
                  "Average size",
                  "MRR / ARR",
                  "MRR contribution",
                  "Cohort conversion",
                ].map((label) => (
                  <th className="p-3 font-medium" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.plans.map((plan) => {
                const money = moneyRows.find((r) => r.plan === plan.plan);
                return (
                  <tr className="border-t" key={plan.plan}>
                    <td className="p-3">
                      <button
                        className="font-semibold underline underline-offset-4"
                        onClick={() =>
                          onDrill(
                            "ORGANIZATIONS",
                            plan.plan as BusinessFilters["plan"],
                          )
                        }
                      >
                        {businessLabel(plan.plan)}
                      </button>
                    </td>
                    <td className="p-3">{plan.organizations}</td>
                    <td className="p-3">{plan.activeOrganizations}</td>
                    <td className="p-3">
                      <button
                        className="underline"
                        onClick={() =>
                          onDrill(
                            "ONBOARDING",
                            plan.plan as BusinessFilters["plan"],
                          )
                        }
                      >
                        {plan.onboardingOrganizations}
                      </button>
                    </td>
                    <td className="p-3">
                      {plan.suspendedOrganizations} /{" "}
                      {plan.cancelledOrganizations}
                    </td>
                    <td className="p-3">
                      {plan.units} / {plan.activeUnits}
                    </td>
                    <td className="p-3">{plan.averageUnits.toFixed(1)}</td>
                    <td className="p-3 text-xs">
                      {money
                        ? `${businessMoney(money.mrrMinor, selectedCurrency)} / ${businessMoney(money.arrMinor, selectedCurrency)}`
                        : "Unavailable"}
                      {plan.subscriptionsMissingPrice > 0 && (
                        <span className="block text-amber-600">
                          Partial pricing coverage
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      {businessPercent(money?.revenueContribution ?? null)}
                    </td>
                    <td className="p-3">
                      {businessPercent(plan.onboardingConversion)}
                      <span className="block text-xs text-muted-foreground">
                        {plan.cohortActivated}/{plan.cohortSignups} signups
                        currently active
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!missing && !total("organizations") && (
          <p className="p-5 text-sm text-muted-foreground">
            No organizations in this dataset and plan selection.
          </p>
        )}
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <h3 className="font-semibold">New organizations by recorded day</h3>
          <p className="text-xs text-muted-foreground">
            Signup events grouped by current tier. Only days with recorded
            events are shown.
          </p>
          {daily.length ? (
            <div
              className="mt-4 h-64"
              role="img"
              aria-label="Recorded Control and Fort Knox signup counts"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar
                    dataKey="Control"
                    fill="var(--primary)"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="FortKnox"
                    name="Fort Knox"
                    fill="var(--muted-foreground)"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-10 text-sm text-muted-foreground">
              No signup events in this period. No historical MRR series has been
              invented.
            </p>
          )}
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold">Growth and applied plan movement</h3>
          <div className="mt-3 space-y-3">
            {data.plans.map((plan) => {
              const previous = data.growth.previous.find(
                (r) => r.plan === plan.plan,
              );
              return (
                <div
                  key={plan.plan}
                  className="rounded-lg bg-muted p-3 text-sm"
                >
                  <strong>{businessLabel(plan.plan)}</strong>
                  <p>
                    {plan.cohortSignups} new organizations · {plan.activations}{" "}
                    recorded activations · {plan.newSubscriptions} new
                    subscription records
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Previous equal-duration period: {previous?.signups ?? 0}{" "}
                    signups · {previous?.activations ?? 0} recorded activations
                  </p>
                </div>
              );
            })}
            <div className="flex flex-wrap gap-2">
              {data.growth.movements.map((row) => (
                <Button
                  key={row.plan + row.kind}
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    onDrill("MOVEMENTS", row.plan as BusinessFilters["plan"])
                  }
                >
                  {businessLabel(row.plan)} {businessLabel(row.kind)}:{" "}
                  {row.count}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Movement coverage starts{" "}
              {data.growth.trackingStartedAt
                ? new Date(data.growth.trackingStartedAt).toLocaleString()
                : "when subscriptions first record a transition"}
              . Scheduled changes are not applied upgrades. Churn rate:
              unavailable without complete historical opening cohorts.
            </p>
          </div>
        </Card>
      </div>
      <Card className="p-5">
        <h3 className="font-semibold">Billing health · {selectedCurrency}</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi
            title="Invoiced in period"
            value={
              billingMissing
                ? "Unavailable"
                : businessMoney(sum("invoicedMinor"), selectedCurrency)
            }
            detail="Issued invoice cohort; excludes drafts and voids"
            onClick={() => onDrill("INVOICES")}
          />
          <Kpi
            title="Verified collections in period"
            value={
              billingMissing
                ? "Unavailable"
                : businessMoney(sum("collectedMinor"), selectedCurrency)
            }
            detail="Verified settlement timestamp; includes prepaid cash"
            onClick={() => onDrill("VERIFIED_PAYMENTS")}
          />
          <Kpi
            title="Outstanding now"
            value={
              billingMissing
                ? "Unavailable"
                : businessMoney(sum("outstandingMinor"), selectedCurrency)
            }
            detail="Open / past-due remaining balances"
            onClick={() => onDrill("OUTSTANDING")}
          />
          <Kpi
            title="Overdue now"
            value={
              billingMissing
                ? "Unavailable"
                : businessMoney(sum("overdueMinor"), selectedCurrency)
            }
            detail="Outstanding with due date before generation time"
            onClick={() => onDrill("OVERDUE")}
          />
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {moneyRows.map((row) => (
            <div className="rounded-lg border p-3 text-xs" key={row.plan}>
              <p className="font-semibold">{businessLabel(row.plan)}</p>
              <p>
                Cohort collection rate: {businessPercent(row.collectionRate)} ·
                MRR per priced organization:{" "}
                {row.averageRevenuePerOrganizationMinor === null
                  ? "Unavailable"
                  : businessMoney(
                      row.averageRevenuePerOrganizationMinor,
                      selectedCurrency,
                    )}{" "}
                · MRR per managed active unit:{" "}
                {row.averageRevenuePerUnitMinor === null
                  ? "Unavailable"
                  : businessMoney(
                      row.averageRevenuePerUnitMinor,
                      selectedCurrency,
                    )}
              </p>
              <p>
                Recurring charge value across active contracts:{" "}
                {businessMoney(
                  row.activeSubscriptionValueMinor,
                  selectedCurrency,
                )}{" "}
                (billing cadences may differ)
              </p>
              {row.unverifiedPaidMinor > 0 && (
                <p className="mt-1 text-amber-600">
                  {businessMoney(row.unverifiedPaidMinor, selectedCurrency)}{" "}
                  marked paid lacks settlement evidence and is excluded from
                  verified collections.
                </p>
              )}
            </div>
          ))}
        </div>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <h3 className="flex items-center gap-2 font-semibold">
            <ShieldCheck size={18} /> Fort Knox operational intelligence
          </h3>
          {data.fortKnox ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <p>
                  {data.fortKnox.organizations} organizations ·{" "}
                  {data.fortKnox.properties} properties
                </p>
                <p>
                  {data.fortKnox.cctvProperties} properties with registered
                  cameras
                </p>
                <button
                  className="text-left underline"
                  onClick={() => onDrill("CAMERAS", "FORT_KNOX")}
                >
                  {data.fortKnox.registeredCameras} registered cameras
                </button>
                <p>{data.fortKnox.onlineCameras} observed online</p>
                <p>
                  {data.fortKnox.offlineCameras} observed offline ·{" "}
                  {data.fortKnox.degradedCameras} degraded
                </p>
                <p>
                  {data.fortKnox.unknownCameras} without usable observations
                </p>
                <button
                  className="text-left underline"
                  onClick={() => onDrill("INCIDENTS", "FORT_KNOX")}
                >
                  {data.fortKnox.unresolvedIncidents} unresolved incidents
                </button>
                <p>
                  {data.fortKnox.recentIncidents} recent incidents ·{" "}
                  {data.fortKnox.evidenceEvents} evidence events
                </p>
                <p>
                  {data.fortKnox.connectivityFailures} recorded connectivity
                  failures
                </p>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Gateway health: unavailable; no persisted gateway probe source.
                Availability is reported observation data, not an active
                connectivity probe. {data.fortKnox.simulatedCameras} simulated
                cameras in this selection.
              </p>
            </>
          ) : (
            <p className="py-5 text-sm text-muted-foreground">
              Fort Knox is outside this selection or its source is unavailable.
            </p>
          )}
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold">Platform operations</h3>
          <div className="mt-3 divide-y">
            {data.operations.map((metric) => (
              <div
                key={metric.key}
                className="flex justify-between gap-3 py-2 text-sm"
              >
                <div>
                  {metric.label}
                  <span className="block text-[10px] text-muted-foreground">
                    {metric.window === "CURRENT"
                      ? "Current state"
                      : "Selected operating period"}{" "}
                    · {metric.source}
                  </span>
                </div>
                <strong>{metric.value ?? "Unavailable"}</strong>
              </div>
            ))}
          </div>
          <a
            className="mt-4 inline-block text-sm underline"
            href="/platform?tab=monitoring"
          >
            Open service health and monitoring
          </a>
        </Card>
      </div>
      <PriorityActions
        actions={data.actions}
        truncated={data.actionsTruncated}
      />
      <details className="rounded-lg border p-4 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium">
          Metric definitions and data coverage
        </summary>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          {data.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
export function MorningBriefView({ brief }: { brief: PlatformBrief }) {
  const result = platformBriefSchema.safeParse(brief);
  if (!result.success)
    return <Alert tone="destructive">{platformAnalyticsResponseError}</Alert>;
  return <ValidMorningBriefView brief={result.data} />;
}
function ValidMorningBriefView({ brief }: { brief: PlatformBrief }) {
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <Sunrise size={20} /> Platform Morning Brief
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Historical snapshot generated{" "}
          {new Date(brief.generatedAt).toLocaleString("en-KE", {
            timeZone: brief.timeZone,
          })}{" "}
          · {brief.timeZone} · {businessLabel(brief.plan)} · {brief.dataset}
        </p>
        <p className="mt-1 break-all text-[10px] text-muted-foreground">
          Integrity: SHA-256 {brief.sha256}
        </p>
      </Card>
      {brief.dataset === "DEMO" && (
        <Alert tone="warning">
          SIMULATED DEMO BRIEF — no real collection or surveillance is implied.
        </Alert>
      )}
      {brief.snapshot.unavailableSources.length > 0 && (
        <Alert tone="warning">
          This snapshot had unavailable sources:{" "}
          {brief.snapshot.unavailableSources.join(", ")}.
        </Alert>
      )}
      <Card className="overflow-hidden">
        <div className="p-5">
          <h4 className="font-semibold">Business and revenue at generation</h4>
          <p className="text-xs text-muted-foreground">
            Saved values, separated by currency. MRR is normalized recurring
            value; collections are verified cash in the operating period.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-muted">
              <tr>
                {[
                  "Plan / currency",
                  "Active organizations",
                  "MRR",
                  "ARR",
                  "Verified collections",
                  "Outstanding / overdue",
                ].map((label) => (
                  <th className="p-3" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {brief.snapshot.revenue.map((row) => (
                <tr className="border-t" key={row.plan + row.currency}>
                  <td className="p-3 font-medium">
                    {businessLabel(row.plan)} / {row.currency}
                  </td>
                  <td className="p-3">
                    {brief.snapshot.unavailableSources.includes(
                      "organizations/subscriptions/portfolio",
                    )
                      ? "Unavailable"
                      : (brief.snapshot.plans.find((p) => p.plan === row.plan)
                          ?.activeOrganizations ?? "Unavailable")}
                  </td>
                  <td className="p-3">
                    {brief.snapshot.unavailableSources.includes(
                      "organizations/subscriptions/portfolio",
                    )
                      ? "Unavailable"
                      : businessMoney(row.mrrMinor, row.currency)}
                  </td>
                  <td className="p-3">
                    {brief.snapshot.unavailableSources.includes(
                      "organizations/subscriptions/portfolio",
                    )
                      ? "Unavailable"
                      : businessMoney(row.arrMinor, row.currency)}
                  </td>
                  <td className="p-3">
                    {brief.snapshot.unavailableSources.includes(
                      "invoices/verified-payment-events",
                    )
                      ? "Unavailable"
                      : businessMoney(row.collectedMinor, row.currency)}
                  </td>
                  <td className="p-3">
                    {brief.snapshot.unavailableSources.includes(
                      "invoices/verified-payment-events",
                    )
                      ? "Unavailable"
                      : businessMoney(row.outstandingMinor, row.currency) +
                        " / " +
                        businessMoney(row.overdueMinor, row.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!brief.snapshot.revenue.length && (
          <p className="p-5 text-sm text-muted-foreground">
            No financial rows were available at generation. See source coverage
            and priorities below.
          </p>
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {brief.snapshot.sections.map((section) => (
          <Card key={section.key} className="p-5">
            <h4 className="font-semibold">{section.title}</h4>
            <p className="mt-2 text-sm text-muted-foreground">
              {section.summary}
            </p>
          </Card>
        ))}
      </div>
      <PriorityActions
        actions={brief.snapshot.actions}
        truncated={brief.snapshot.actionsTruncated}
      />
    </div>
  );
}
export function PlatformBusiness({
  mode = "performance",
  onOrganization,
}: {
  mode?: "performance" | "brief";
  onOrganization: (
    organizationId: string,
    tab?: "organizations" | "billing" | "landlord onboarding" | "security",
  ) => void;
}) {
  const admin = Boolean(useAuth().user?.isPlatformAdmin),
    search = usePlatformSearch(),
    params = new URLSearchParams(search);
  const urlPlan = params.get("plan"),
    urlDataset = params.get("dataset"),
    urlKind = params.get("kind"),
    urlOrg = params.get("organizationId"),
    urlPeriod = params.get("period");
  const urlFilters: BusinessFilters = {
    ...defaults,
    ...(["ALL", "CONTROL", "FORT_KNOX", "OTHER", "UNASSIGNED"].includes(
      urlPlan ?? "",
    )
      ? { plan: urlPlan as BusinessFilters["plan"] }
      : {}),
    ...(urlDataset === "DEMO" && process.env.NODE_ENV !== "production"
      ? { dataset: "DEMO" as const }
      : {}),
    ...((businessPeriods as readonly string[]).includes(urlPeriod ?? "")
      ? { period: urlPeriod as BusinessFilters["period"] }
      : {}),
    ...(params.get("timeZone") ? { timeZone: params.get("timeZone")! } : {}),
    ...(params.get("from") ? { from: params.get("from")! } : {}),
    ...(params.get("to") ? { to: params.get("to")! } : {}),
  };
  const [filterOverride, setFilterOverride] = useState<BusinessFilters>(),
    filters = filterOverride ?? urlFilters;
  const [kindOverride, setKind] = useState<DrillKind>(),
    kind =
      kindOverride ??
      ([
        "ORGANIZATIONS",
        "ACTIVE",
        "ONBOARDING",
        "SIGNATURE",
        "PAYMENT",
        "ATTENTION",
        "OVERDUE",
        "INVOICES",
        "OUTSTANDING",
        "VERIFIED_PAYMENTS",
        "UNVERIFIED_PAYMENTS",
        "BILLING_EVENTS",
        "CAMERAS",
        "INCIDENTS",
        "MOVEMENTS",
      ].includes(urlKind ?? "")
        ? (urlKind as DrillKind)
        : "ORGANIZATIONS");
  const [drillOverride, setDrilling] = useState<boolean>(),
    drilling = drillOverride ?? Boolean(urlKind),
    [orgOverride, setOrganizationId] = useState<string | null>(),
    organizationId =
      orgOverride === undefined
        ? /^[a-fA-F0-9]{24}$/.test(urlOrg ?? "")
          ? urlOrg!
          : undefined
        : (orgOverride ?? undefined);
  const [page, setPage] = useState(1),
    [historyPage, setHistoryPage] = useState(1),
    [briefId, setBriefId] = useState("");
  const idempotency = useRef<string>("");
  const valid =
      filters.period !== "CUSTOM" || Boolean(filters.from && filters.to),
    overview = usePlatformBusiness(
      filters,
      admin && valid && mode === "performance",
    ),
    drill = useBusinessDrill(
      filters,
      kind,
      page,
      organizationId,
      admin && valid && drilling,
    ),
    history = useBriefHistory(filters, historyPage, admin && mode === "brief"),
    historical = useHistoricalBrief(
      filters,
      briefId,
      admin && mode === "brief",
    ),
    generate = useGenerateBrief(filters);
  const change = (next: BusinessFilters) => {
    setFilterOverride(next);
    setPage(1);
    setHistoryPage(1);
    setBriefId("");
    idempotency.current = "";
    generate.reset();
  };
  const inspect = (next: DrillKind, plan?: BusinessFilters["plan"]) => {
    if (plan) setFilterOverride({ ...filters, plan });
    setKind(next);
    setPage(1);
    setOrganizationId(null);
    setDrilling(true);
  };
  async function createBrief() {
    idempotency.current ||= crypto.randomUUID();
    try {
      const result = await generate.mutateAsync(idempotency.current);
      setBriefId(result._id);
      idempotency.current = "";
    } catch {
      /* Keep the request key on retry to prevent duplicate snapshots. */
    }
  }
  if (!admin)
    return (
      <Alert tone="destructive">
        SUPER_ADMIN platform authorization is required.
      </Alert>
    );
  const brief =
    historical.data ??
    (briefId === generate.data?._id ? generate.data : undefined);
  return (
    <section
      className="space-y-5"
      aria-label={
        mode === "brief" ? "Platform Morning Brief" : "Plan Performance"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            {mode === "brief" ? (
              <Sunrise size={21} />
            ) : (
              <ChartNoAxesCombined size={21} />
            )}{" "}
            {mode === "brief" ? "Platform Morning Brief" : "Plan Performance"}
          </h2>
          <p className="text-sm text-muted-foreground">
            SUPER_ADMIN business and platform operations across organizations.
          </p>
        </div>
        {mode === "performance" && (
          <Button variant="outline" onClick={() => void overview.refetch()}>
            <RefreshCw size={15} /> Refresh
          </Button>
        )}
      </div>
      <BusinessFiltersBar filters={filters} onChange={change} />
      {!valid && <Alert>Select both dates to load a custom range.</Alert>}
      {mode === "performance" && (
        <>
          {overview.isPending && valid && (
            <div aria-label="Loading platform analytics" className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                {[1, 2, 3, 4].map((n) => (
                  <Skeleton key={n} className="h-28" />
                ))}
              </div>
              <Skeleton className="h-64" />
            </div>
          )}
          {overview.isError && (
            <Alert tone="destructive">
              Analytics unavailable: {overview.error.message}{" "}
              <Button variant="outline" onClick={() => void overview.refetch()}>
                Retry analytics
              </Button>
            </Alert>
          )}
          {overview.data && (
            <PlanPerformanceView data={overview.data} onDrill={inspect} />
          )}
        </>
      )}
      {mode === "brief" && (
        <>
          <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <h3 className="font-semibold">
                Generate an operating-period snapshot
              </h3>
              <p className="text-xs text-muted-foreground">
                Saved server-side with current priorities and financial/source
                coverage. Historical records never recalculate. No delivery is
                sent.
              </p>
            </div>
            <Button
              disabled={!valid}
              loading={generate.isPending}
              onClick={() => void createBrief()}
            >
              Generate Morning Brief
            </Button>
          </Card>
          {generate.isError && (
            <Alert tone="destructive">
              {generate.error.message}{" "}
              <Button variant="outline" onClick={() => void createBrief()}>
                Retry generation
              </Button>
            </Alert>
          )}
          {historical.isPending && briefId && <Skeleton className="h-64" />}
          {historical.isError && (
            <Alert tone="destructive">
              Historical brief unavailable.{" "}
              <Button
                variant="outline"
                onClick={() => void historical.refetch()}
              >
                Retry brief
              </Button>
            </Alert>
          )}
          {brief && <MorningBriefView brief={brief} />}
          <Card className="p-5">
            <h3 className="font-semibold">Historical platform briefs</h3>
            {history.isPending && <Skeleton className="mt-3 h-20" />}
            {history.isError && (
              <Alert tone="warning">
                Brief history unavailable.{" "}
                <Button
                  variant="outline"
                  onClick={() => void history.refetch()}
                >
                  Retry history
                </Button>
              </Alert>
            )}
            {history.data && !history.data.items.length && (
              <p className="py-5 text-sm text-muted-foreground">
                No generated briefs in this dataset and plan selection.
              </p>
            )}
            <div className="mt-3 space-y-2">
              {history.data?.items.map((item) => (
                <button
                  key={item._id}
                  className="flex w-full flex-wrap justify-between gap-2 rounded-lg border p-3 text-left text-sm hover:bg-muted"
                  onClick={() => setBriefId(item._id)}
                >
                  <span>
                    {new Date(item.generatedAt).toLocaleString("en-KE", {
                      timeZone: item.timeZone,
                    })}{" "}
                    · {businessLabel(item.plan)}
                  </span>
                  <span>
                    {item.dataset} · v{item.version}
                  </span>
                </button>
              ))}
            </div>
            {history.data && (
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={historyPage === 1}
                  onClick={() => setHistoryPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    historyPage * history.data.pageSize >= history.data.total
                  }
                  onClick={() => setHistoryPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </Card>
        </>
      )}
      {drilling && (
        <Card className="p-5">
          <div className="flex flex-wrap justify-between gap-3">
            <h3 className="font-semibold">
              Drill-down: {businessLabel(kind)}
              {organizationId ? " · selected organization" : ""}
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDrilling(false)}
            >
              Close drill-down
            </Button>
          </div>
          {drill.isPending && <Skeleton className="mt-3 h-24" />}
          {drill.isError && (
            <Alert tone="destructive">
              Drill-down unavailable.{" "}
              <Button variant="outline" onClick={() => void drill.refetch()}>
                Retry drill-down
              </Button>
            </Alert>
          )}
          {drill.data && (
            <>
              <p className="my-3 text-xs text-muted-foreground">
                {drill.data.total} matching records · page {page} · audited
                access
              </p>
              {!drill.data.items.length && (
                <p className="py-5 text-sm text-muted-foreground">
                  No records match this drill-down.
                </p>
              )}
              <div className="space-y-2">
                {drill.data.items.map((item, index) => (
                  <div
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                    key={item._id + ":" + index}
                  >
                    <div>
                      <p className="font-semibold">
                        {item.organizationName ?? item.name ?? item._id}
                      </p>
                      <p>
                        {item.invoiceNumber ??
                          item.cameraCode ??
                          item.title ??
                          businessLabel(
                            item.state ??
                              item.kind ??
                              item.status ??
                              "Organization",
                          )}{" "}
                        · {businessLabel(item.plan ?? "UNASSIGNED")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.totalMinor !== undefined
                          ? businessMoney(item.totalMinor, item.currency)
                          : ""}{" "}
                        {item.availability && <StatusBadge status={item.availability} domain="integration" />}
                        {item.severity && <StatusBadge status={item.severity} domain="predictive" />}
                        {item.attentionCode && <StatusBadge status={item.attentionCode} domain="onboarding" />}
                        {(item.state || item.status) && <StatusBadge status={item.state ?? item.status} domain={kind === "INCIDENTS" ? "incident" : kind === "CAMERAS" ? "integration" : kind === "INVOICES" || kind === "BILLING_EVENTS" ? "billing" : kind === "VERIFIED_PAYMENTS" || kind === "UNVERIFIED_PAYMENTS" ? "payment" : "onboarding"} />}
                        {item.fromPlan && item.toPlan
                          ? ` · ${businessLabel(item.fromPlan)} → ${businessLabel(item.toPlan)}`
                          : ""}{" "}
                        {item.dueDate
                          ? "· due " +
                            new Date(item.dueDate).toLocaleDateString()
                          : ""}
                        {item.contractId
                          ? " · contract " + item.contractId
                          : ""}
                        {item.propertyId
                          ? " · property " + item.propertyId
                          : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {item.organizationId && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setOrganizationId(item.organizationId);
                              setKind("ORGANIZATIONS");
                              setPage(1);
                            }}
                          >
                            Inspect organization
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              onOrganization(
                                item.organizationId!,
                                kind === "INVOICES" || kind === "OVERDUE"
                                  ? "billing"
                                  : kind === "SIGNATURE" ||
                                      kind === "PAYMENT" ||
                                      kind === "ATTENTION"
                                    ? "landlord onboarding"
                                    : kind === "CAMERAS" || kind === "INCIDENTS"
                                      ? "security"
                                      : "organizations",
                              )
                            }
                          >
                            Open existing controls
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page * drill.data.pageSize >= drill.data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </>
          )}
        </Card>
      )}
    </section>
  );
}
