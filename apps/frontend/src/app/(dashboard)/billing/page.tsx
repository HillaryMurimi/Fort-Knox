"use client";
import { useMemo, useState } from "react";
import * as I from "@/components/icons";
import {
  Badge,
  EmptyState,
  PageTitle,
  SectionHeader,
  Stat,
} from "@/components/ui";
import { useOrganization } from "@/hooks/use-organization";
import {
  useBillingEntitlementsQuery,
  useBillingInvoicesQuery,
  useBillingPlansQuery,
  useBillingSubscriptionQuery,
  useBillingUsageQuery,
  useCancelSubscriptionMutation,
  useChangePlanMutation,
  useRecoverCheckoutMutation,
  useSubscribeMutation,
} from "@/hooks/queries/use-billing-queries";
import type {
  BillingPlan,
  BillingSubscription,
} from "@/lib/data/resource-types";

const money = (currency: string, n: number) =>
  `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const date = (v?: string) =>
  v
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
        new Date(v),
      )
    : "—";
const interval = (v: BillingPlan["billingInterval"]) =>
  v === "MONTH" ? "month" : v === "QUARTER" ? "quarter" : "year";
const tone = (s: BillingSubscription["status"] | "UNSUBSCRIBED") =>
  s === "ACTIVE" || s === "TRIALING"
    ? "green"
    : s === "PAST_DUE" || s === "PAUSED"
      ? "orange"
      : s === "CANCELLED" || s === "EXPIRED"
        ? "red"
        : "neutral";
const lim = (n: number) => (n < 0 ? "Unlimited" : n.toLocaleString());
const planOf = (
  v: BillingPlan | string | undefined,
  plans: BillingPlan[] | undefined,
) => (typeof v === "object" && v ? v : plans?.find((p) => p._id === v));

export default function BillingPage() {
  const { activeOrganizationId } = useOrganization();
  const organizationId = activeOrganizationId ?? undefined;
  const plans = useBillingPlansQuery();
  const sub = useBillingSubscriptionQuery(organizationId);
  const ent = useBillingEntitlementsQuery(organizationId);
  const usage = useBillingUsageQuery(organizationId);
  const invoices = useBillingInvoicesQuery(organizationId);

  const subscribe = useSubscribeMutation(organizationId);
  const change = useChangePlanMutation(organizationId);
  const recover = useRecoverCheckoutMutation(organizationId);
  const cancel = useCancelSubscriptionMutation(organizationId);
  const provider = "PAYSTACK" as const;
  const [billingEmail, setBillingEmail] = useState("");
  const [atEnd, setAtEnd] = useState(true);
  const [cancelAtEnd, setCancelAtEnd] = useState(true);
  const [busy, setBusy] = useState<string>();
  const current =
    planOf(sub.data?.planId, plans.data) ?? ent.data?.plan ?? undefined;
  const pending = planOf(sub.data?.pendingPlanId, plans.data);
  const usageRows = useMemo(
    () =>
      current && usage.data
        ? ([
            [
              "Properties",
              usage.data.metrics.PROPERTIES,
              current.entitlements.maxProperties,
            ],
            ["Units", usage.data.metrics.UNITS, current.entitlements.maxUnits],
            ["Users", usage.data.metrics.USERS, current.entitlements.maxUsers],
            [
              "Tenants",
              usage.data.metrics.TENANTS,
              current.entitlements.maxTenants,
            ],
          ] as const)
        : [],
    [current, usage.data],
  );
  const trialDays =
    sub.data?.trialEndsAt && sub.data.status === "TRIALING"
      ? Math.max(
          0,
          Math.ceil(
            (new Date(sub.data.trialEndsAt).getTime() - Date.now()) / 86400000,
          ),
        )
      : undefined;
  const openBalance =
    invoices.data?.items
      .filter((i) => i.status === "OPEN" || i.status === "PAST_DUE")
      .reduce((sum, i) => sum + Math.max(0, i.total - i.amountPaid), 0) ?? 0;
  function selectPlan(p: BillingPlan) {
    if (!activeOrganizationId) return;
    setBusy(p.key);
    if (!sub.data || sub.data.status === "CANCELLED" || sub.data.status === "EXPIRED")
      subscribe.mutate(
        { planKey: p.key, provider, ...(billingEmail ? { email: billingEmail } : {}) },
        { onSettled: () => setBusy(undefined) },
      );
    else
      change.mutate(
        { planKey: p.key, atPeriodEnd: sub.data?.provider === "PAYSTACK" ? true : atEnd },
        { onSettled: () => setBusy(undefined) },
      );
  }
  return (
    <>
      <PageTitle
        eyebrow="Commercial control plane"
        title="Billing & Subscription"
        description="Manage the organization subscription lifecycle, plans, invoices, usage and entitlement limits."
        action={
          <button
            className="btn-secondary"
            onClick={() => {
              void plans.refetch();
              void sub.refetch();
              void invoices.refetch();
              void usage.refetch();
              void ent.refetch();
            }}
          >
            <I.RefreshCw size={15} />
            Refresh
          </button>
        }
      />
      {!activeOrganizationId ? (
        <EmptyState
          icon={I.CreditCard}
          title="No active organization"
          description="Select an organization before managing billing."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
            <Stat
              label="Current plan"
              value={current?.name ?? "None"}
              sub={
                current
                  ? `${money(current.currency, current.amount)} / ${interval(current.billingInterval)}`
                  : "Choose a plan"
              }
              icon={I.CreditCard}
            />
            <Stat
              label="Subscription"
              value={sub.data?.status ?? "UNSUBSCRIBED"}
              sub={
                sub.data?.currentPeriodEnd
                  ? `Period ends ${date(sub.data.currentPeriodEnd)}`
                  : "No active period"
              }
              icon={I.ShieldCheck}
            />
            <Stat
              label="Trial"
              value={
                trialDays !== undefined
                  ? `${trialDays}d`
                  : sub.data?.status === "TRIALING"
                    ? "Active"
                    : "—"
              }
              sub={
                sub.data?.trialEndsAt
                  ? `Ends ${date(sub.data.trialEndsAt)}`
                  : "No trial"
              }
              icon={I.Clock3}
            />
            <Stat
              label="Open balance"
              value={money(
                invoices.data?.items[0]?.currency ?? current?.currency ?? "KES",
                openBalance,
              )}
              sub="Open + past-due invoices"
              icon={I.CircleDollarSign}
            />
            <Stat
              label="Entitlements"
              value={ent.data?.status ?? "—"}
              sub={current ? "Plan-backed limits" : "No entitlements"}
              icon={I.ShieldCheck}
            />
          </div>
          {sub.data?.status === "PAST_DUE" && (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-[var(--warning-soft)] p-4 flex gap-3">
              <I.AlertTriangle size={18} />
              <div>
                <div className="font-semibold text-sm">
                  Billing requires attention
                </div>
                <p className="text-xs text-[var(--warning-text)]/75 mt-1">
                  This subscription is past due. Review the invoice state and
                  complete payment through the configured provider.
                </p>
                {sub.data.gracePeriodEndsAt && (
                  <div className="text-xs font-medium mt-2">
                    Grace period ends {date(sub.data.gracePeriodEndsAt)}.
                  </div>
                )}
              </div>
            </div>
          )}
          {sub.data?.cancelAtPeriodEnd && (
            <div className="mt-5 rounded-2xl border border-red-200 bg-[var(--danger-soft)] p-4 flex gap-3">
              <I.CalendarDays size={18} />
              <div>
                <div className="font-semibold text-sm">
                  Cancellation scheduled
                </div>
                <p className="text-xs text-[var(--danger-text)]/75 mt-1">
                  The subscription is scheduled to end at{" "}
                  {date(sub.data.currentPeriodEnd)}.
                </p>
              </div>
            </div>
          )}

          <div className="card p-5 mt-6">
            <SectionHeader
              title="Current subscription"
              action={
                sub.data && (
                  <Badge tone={tone(sub.data.status)}>{sub.data.status}</Badge>
                )
              }
            />
            {sub.isLoading ? (
              <div className="text-sm text-muted-foreground">
                Loading subscription…
              </div>
            ) : !sub.data ? (
              <div className="grid md:grid-cols-[1fr_auto] gap-4 items-end">
                <div>
                  <div className="font-semibold">
                    No organization subscription
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Choose a plan below and complete secure Paystack checkout.
                    Access begins after payment confirmation.
                  </p>
                </div>
                <label className="text-sm">Billing email<input className="input mt-1" type="email" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} placeholder="name@example.com" /></label>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
                <Info
                  label="Billing period"
                  value={`${date(sub.data.currentPeriodStart)} → ${date(sub.data.currentPeriodEnd)}`}
                />
                <Info label="Provider" value={sub.data.provider} />
                <Info
                  label="Pending plan"
                  value={
                    pending
                      ? `${pending.name} · ${date(sub.data.pendingPlanEffectiveAt)}`
                      : "None"
                  }
                />
                <Info
                  label="Cancellation"
                  value={
                    sub.data.cancelAtPeriodEnd
                      ? "At period end"
                      : "Not scheduled"
                  }
                />
              </div>
            )}
          </div>

          <div className="card p-5 mt-6">
            <SectionHeader
              title="Plans"
              action={
                <span className="text-xs text-muted-foreground">
                  Live backend plan catalog
                </span>
              }
            />
            <div className="grid lg:grid-cols-3 gap-4">
              {plans.data?.map((p) => {
                const selected = current && !["CANCELLED", "EXPIRED"].includes(sub.data?.status ?? "") ? current._id === p._id : false;
                return (
                  <div
                    key={p._id}
                    className={`rounded-2xl border p-5 ${selected ? "border-[#d97745] bg-[#fffaf7]" : "border-border"}`}
                  >
                    <div className="flex justify-between gap-3">
                      <div>
                        <div className="font-semibold">{p.name}</div>
                        <div className="text-xs text-muted-foreground mt-1 min-h-8">
                          {p.description || "Organization subscription"}
                        </div>
                      </div>
                      {selected && <Badge tone="orange">CURRENT</Badge>}
                    </div>
                    <div className="mt-5">
                      <span className="text-2xl font-semibold">
                        {money(p.currency, p.amount)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        / {interval(p.billingInterval)}
                      </span>
                    </div>
                    <div className="mt-4 space-y-2 text-xs">
                      {[
                        ["Properties", p.entitlements.maxProperties],
                        ["Units", p.entitlements.maxUnits],
                        ["Users", p.entitlements.maxUsers],
                        ["Tenants", p.entitlements.maxTenants],
                      ].map(([label, value]) => (
                        <div
                          key={String(label)}
                          className="flex justify-between"
                        >
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-medium">
                            {lim(value as number)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-1">
                      {p.entitlements.features.slice(0, 6).map((f) => (
                        <span
                          key={f}
                          className="px-2 py-1 rounded-full bg-muted text-[10px]"
                        >
                          {f.replaceAll("-", " ")}
                        </span>
                      ))}
                    </div>
                    <button
                      className="btn-primary w-full mt-5"
                      disabled={
                        selected ||
                        (sub.data?.provider === "PAYSTACK" && !["ACTIVE", "CANCELLED", "EXPIRED"].includes(sub.data.status)) ||
                        busy === p.key ||
                        subscribe.isPending ||
                        change.isPending
                      }
                      onClick={() => selectPlan(p)}
                    >
                      {busy === p.key
                        ? "Applying…"
                        : sub.data?.provider === "PAYSTACK" && sub.data.status === "ACTIVE"
                          ? "Change at renewal"
                          : sub.data
                          ? "Select plan"
                          : "Start subscription"}
                    </button>
                  </div>
                );
              })}
            </div>
            {sub.data?.status === "PENDING" && sub.data.providerCheckoutUrl && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <a className="btn-primary inline-flex" href={sub.data.providerCheckoutUrl} target="_blank" rel="noopener noreferrer">Open secure Paystack checkout</a>
                <button className="btn-secondary" disabled={recover.isPending} onClick={() => recover.mutate()}>{recover.isPending ? "Checking payment..." : "Check payment / retry"}</button>
              </div>
            )}
            {(recover.error || change.error || subscribe.error) && <p role="alert" className="mt-3 text-sm text-[var(--destructive)]">{(recover.error ?? change.error ?? subscribe.error)?.message}</p>}
            {sub.data?.provider === "PAYSTACK" && sub.data.status === "ACTIVE" && <p className="mt-3 text-xs text-muted-foreground">Plan changes take effect after the next confirmed renewal.</p>}
            {!sub.data && (
              <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
                <span>New subscription provider:</span>
                <span>Paystack</span>
                <span>Provider secrets remain backend-only.</span>
              </div>
            )}
            {sub.data && sub.data.provider !== "PAYSTACK" && (
              <label className="mt-4 flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={atEnd}
                  onChange={(e) => setAtEnd(e.target.checked)}
                />
                Apply plan changes at period end{" "}
                <span className="text-muted-foreground">
                  (unchecked = immediate change)
                </span>
              </label>
            )}
          </div>

          <div className="grid xl:grid-cols-[1.1fr_.9fr] gap-6 mt-6">
            <div className="card p-5">
              <SectionHeader
                title="Usage & limits"
                action={
                  <span className="text-xs text-muted-foreground">
                    Live organization counts
                  </span>
                }
              />
              {usageRows.length === 0 ? (
                <EmptyState
                  icon={I.BarChart3}
                  title="Usage unavailable"
                  description="The backend usage snapshot currently reports properties, units, users and tenants."
                />
              ) : (
                <div className="space-y-4">
                  {usageRows.map(([label, used, max]) => {
                    const pct = max < 0 ? 0 : Math.min(100, (used / max) * 100);
                    return (
                      <div key={label}>
                        <div className="flex justify-between text-sm">
                          <span>{label}</span>
                          <span className="font-medium">
                            {used.toLocaleString()} / {lim(max)}
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full mt-2 overflow-hidden">
                          <div
                            className="h-full bg-[#d97745] rounded-full"
                            style={{ width: max < 0 ? "8%" : `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="card p-5">
              <SectionHeader title="Entitled capabilities" />
              {current ? (
                <div className="grid gap-2">
                  {current.entitlements.features.map((f) => (
                    <div
                      key={f}
                      className="rounded-xl border border-border px-3 py-2 text-xs flex items-center gap-2"
                    >
                      <I.ShieldCheck size={14} />
                      {f.replaceAll("-", " ")}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={I.ShieldCheck}
                  title="No entitlements"
                  description="Subscribe to a plan to activate organization capabilities."
                />
              )}
            </div>
          </div>

          <div className="card p-5 mt-6">
            <SectionHeader
              title="Subscription invoices"
              action={
                <span className="text-xs text-muted-foreground">
                  Billing history & payment state
                </span>
              }
            />
            {invoices.isLoading ? (
              <div className="text-sm text-muted-foreground">Loading invoices…</div>
            ) : invoices.data?.items.length === 0 ? (
              <EmptyState
                icon={I.FileText}
                title="No invoices"
                description="Invoices will appear here as the billing lifecycle creates them."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-[.12em] text-muted-foreground border-b border-border">
                      <th className="py-3 pr-4">Invoice</th>
                      <th className="py-3 pr-4">Period</th>
                      <th className="py-3 pr-4">Due</th>
                      <th className="py-3 pr-4">Amount</th>
                      <th className="py-3">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.data?.items.map((inv) => (
                      <tr key={inv._id} className="border-b border-[#f2f4f7]">
                        <td className="py-3 pr-4 font-medium">
                          {inv.invoiceNumber}
                        </td>
                        <td className="py-3 pr-4 text-xs text-muted-foreground">
                          {date(inv.periodStart)} → {date(inv.periodEnd)}
                        </td>
                        <td className="py-3 pr-4 text-xs">
                          {date(inv.dueDate)}
                        </td>
                        <td className="py-3 pr-4">
                          {money(inv.currency, inv.total)}
                        </td>
                        <td className="py-3">
                          <Badge
                            tone={
                              inv.status === "PAID"
                                ? "green"
                                : inv.status === "PAST_DUE"
                                  ? "orange"
                                  : inv.status === "VOID" ||
                                      inv.status === "UNCOLLECTIBLE"
                                    ? "red"
                                    : "neutral"
                            }
                          >
                            {inv.status}
                          </Badge>
                          {inv.amountPaid > 0 && inv.status !== "PAID" && (
                            <div className="text-[10px] text-muted-foreground mt-1">
                              Paid {money(inv.currency, inv.amountPaid)}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {sub.data &&
            sub.data.status !== "CANCELLED" &&
            sub.data.status !== "EXPIRED" && sub.data.status !== "PENDING" && (
              <div className="card p-5 mt-6">
                <SectionHeader title="Subscription controls" />
                <div className="grid md:grid-cols-[1fr_auto] gap-5 items-center">
                  <div>
                    <div className="font-medium text-sm">
                      Cancel subscription
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Schedule cancellation at the period boundary or cancel
                      immediately.
                    </p>
                    <label className="flex items-center gap-2 text-xs mt-3">
                      <input
                        type="checkbox"
                        checked={cancelAtEnd}
                        onChange={(e) => setCancelAtEnd(e.target.checked)}
                      />
                      Cancel at period end
                    </label>
                  </div>
                  <button
                    className="btn-secondary"
                    disabled={cancel.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          cancelAtEnd
                            ? "Schedule cancellation at period end?"
                            : "Cancel immediately?",
                        )
                      )
                        cancel.mutate(cancelAtEnd);
                    }}
                  >
                    <I.CalendarDays size={15} />
                    {cancel.isPending ? "Updating…" : "Cancel subscription"}
                  </button>
                </div>
              </div>
            )}
        </>
      )}
    </>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[.14em] text-muted-foreground">
        {label}
      </div>
      <div className="font-medium mt-1 text-sm">{value}</div>
    </div>
  );
}
