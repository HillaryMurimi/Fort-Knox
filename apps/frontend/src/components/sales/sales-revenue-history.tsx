"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Alert, Button, Dialog } from "@/components/ui";
import {
  revenueClient as client,
  revenueMoney as money,
  type RevenueHistory,
  type MovementSource,
} from "@/lib/data/sales-revenue";

const panel = "min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-7";
const input =
  "mt-1 block w-full min-w-0 rounded-lg border border-border bg-background p-2 text-sm";
const human = (value: string) => value.replaceAll("_", " ").toLowerCase();
export function SalesRevenueHistory() {
  const auth = useAuth();
  const allowed = !auth.isDevMode && auth.roles.includes("SUPER_ADMIN");
  const [selection, setSelection] = useState<{
    from: string;
    to: string;
    currency: string;
  } | null>(null);
  const [page, setPage] = useState(1),
    [source, setSource] = useState("");
  const key = ["sales-revenue", auth.user?._id, allowed, "history"];
  const history = useQuery({
    queryKey: [...key, selection],
    queryFn: () => client.history(selection!),
    enabled: allowed && !!selection,
    retry: false,
  });
  const events = useQuery({
    queryKey: [...key, "events", selection?.currency, page],
    queryFn: () => client.movements(selection!.currency, page),
    enabled: allowed && !!selection,
    retry: false,
  });
  const evidence = useQuery({
    queryKey: [...key, "source", source],
    queryFn: () => client.movementSource(source),
    enabled: allowed && !!source,
    retry: false,
  });
  if (!allowed) return null;
  return (
    <section
      className={panel + " space-y-6"}
      aria-labelledby="revenue-history-heading"
    >
      <header>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Subscription evidence
        </p>
        <h3 id="revenue-history-heading" className="mt-2 text-2xl font-medium">
          Movement &amp; retention history
        </h3>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Follow recurring value from verified billing events. Choose up to
          twelve Nairobi calendar months; an incomplete period stays
          unavailable.
        </p>
      </header>
      <form
        className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          setSelection({
            from: String(form.get("from")),
            to: String(form.get("to")),
            currency: String(form.get("currency")),
          });
          setPage(1);
          setSource("");
        }}
      >
        <label className="min-w-0 text-sm">
          History from
          <input
            className={input}
            name="from"
            type="month"
            required
            min="2020-01"
            max="2100-12"
          />
        </label>
        <label className="min-w-0 text-sm">
          History through
          <input
            className={input}
            name="to"
            type="month"
            required
            min="2020-01"
            max="2100-12"
          />
        </label>
        <label className="min-w-0 text-sm">
          History currency
          <select className={input} name="currency">
            {["KES", "USD", "NGN", "GHS", "ZAR"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <Button type="submit" className="self-end">
          Load history
        </Button>
      </form>
      {history.isLoading && <p role="status">Loading historical evidence…</p>}
      {history.error && (
        <Alert>
          {history.error.message}{" "}
          <Button variant="link" onClick={() => void history.refetch()}>
            Retry history
          </Button>
        </Alert>
      )}
      {!history.error && history.data && (
        <RevenueHistoryResults data={history.data} />
      )}
      {selection && (
        <div className="min-w-0 space-y-4">
          <h4 className="text-lg font-medium">Movement sources</h4>
          <p className="text-xs text-muted-foreground">
            All retained movements in {selection.currency}, newest effective
            date first. Twenty per page.
          </p>
          {events.isLoading && <p role="status">Loading movement sources…</p>}
          {events.error && (
            <Alert>
              {events.error.message}{" "}
              <Button variant="link" onClick={() => void events.refetch()}>
                Retry sources
              </Button>
            </Alert>
          )}
          {!events.error && events.data?.total === 0 && (
            <p>No retained movement sources.</p>
          )}
          {!events.error &&
            events.data?.items.map((event) => (
              <article
                key={event._id}
                className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-border pt-4"
              >
                <div className="min-w-0 flex-1 break-words">
                  <p className="text-sm font-medium capitalize">
                    {human(event.kind)} · {event.effectiveAt.slice(0, 10)}
                  </p>
                  <p className="mt-1 text-sm tabular-nums">
                    {money(event.previousMinor, event.currency)} →{" "}
                    {money(event.newMinor, event.currency)}
                  </p>
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    Organization {event.organizationId} · Sequence{" "}
                    {event.sequence}
                  </p>
                </div>
                <Button variant="outline" onClick={() => setSource(event._id)}>
                  Inspect source {event.sequence}
                </Button>
              </article>
            ))}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous movements
            </Button>
            <span className="text-xs">Page {page}</span>
            <Button
              variant="outline"
              disabled={
                !events.data || !!events.error || page * 20 >= events.data.total
              }
              onClick={() => setPage((p) => p + 1)}
            >
              Next movements
            </Button>
          </div>
        </div>
      )}
      <Dialog
        open={!!source}
        onOpenChange={(open) => {
          if (!open) setSource("");
        }}
        title="Movement evidence"
        description="Retained source references. No invoice or historical event is changed by this view."
      >
        {evidence.isLoading && <p role="status">Loading source evidence…</p>}
        {evidence.error && (
          <Alert>
            {evidence.error.message}{" "}
            <Button variant="link" onClick={() => void evidence.refetch()}>
              Retry source
            </Button>
          </Alert>
        )}
        {!evidence.error && evidence.data && (
          <RevenueMovementSource data={evidence.data} />
        )}
      </Dialog>
    </section>
  );
}
export function RevenueMovementSource({ data }: { data: MovementSource }) {
  const e = data.event;
  const fields = {
    Movement: e._id,
    Organization: e.organizationId,
    Subscription: e.subscriptionId,
    Effective: e.effectiveAt,
    Recorded: e.recordedAt,
    Type: human(e.kind),
    Before: money(e.previousMinor, e.currency),
    After: money(e.newMinor, e.currency),
    Source: human(e.sourceKind),
    Reference: e.sourceReference,
    Invoice: data.invoice?.invoiceNumber ?? "Unavailable",
    Contract: e.contractId ?? "Unavailable",
    "Payment proof": data.proof
      ? `${data.proof.provider} · ${data.proof.type} · ${data.proof.status} · ${data.proof._id}`
      : "Unavailable",
    "Webhook proof": data.webhook
      ? `${data.webhook.provider} · ${data.webhook.status} · ${data.webhook._id}`
      : "Not attached",
    "Opening evidence": e.completeFromStart
      ? "Complete recorded chain"
      : "Incomplete",
    Gaps: e.gaps.map(human).join(", ") || "None recorded",
  };
  return (
    <dl className="space-y-3 text-sm">
      {Object.entries(fields).map(([label, value]) => (
        <div key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="break-all">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
export function RevenueHistoryResults({ data }: { data: RevenueHistory }) {
  return (
    <div className="min-w-0 space-y-6">
      <Alert>
        {data.sourceCount} retained movements ·{" "}
        {data.bridges.filter((b) => b.complete).length}/{data.bridges.length}{" "}
        complete months. Provider completeness is not certified. These are
        derived analytical snapshots, not recognized revenue or authorization to
        contact customers.
      </Alert>
      <p className="text-xs text-muted-foreground">
        Evidence as of {data.asOf}. Opening + new + reactivation + expansion −
        contraction − churn = closing.
      </p>
      <div
        role="region"
        aria-label="Monthly MRR bridges"
        tabIndex={0}
        className="max-w-full overflow-x-auto rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
      >
        <table className="w-full text-left text-sm tabular-nums">
          <caption className="pb-3 text-left font-medium">
            Monthly MRR bridge · {data.currency}
          </caption>
          <thead>
            <tr>
              {[
                "Month",
                "Opening",
                "New",
                "Reactivation",
                "Expansion",
                "Contraction",
                "Churn",
                "Closing",
                "Evidence",
              ].map((h) => (
                <th key={h} scope="col" className="whitespace-nowrap p-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.bridges.map((b) => (
              <tr key={b.month} className="border-t border-border">
                <th scope="row" className="p-3">
                  {b.month}
                </th>
                {[
                  b.openingMinor,
                  b.newMinor,
                  b.reactivationMinor,
                  b.expansionMinor,
                  b.contractionMinor,
                  b.churnedMinor,
                  b.closingMinor,
                ].map((value, i) => (
                  <td key={i} className="whitespace-nowrap p-3">
                    {money(value, data.currency)}
                  </td>
                ))}
                <td className="min-w-52 p-3">
                  {b.complete ? "Reconciled" : b.reasons.map(human).join("; ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
        {data.definition}
      </p>
      <div
        role="region"
        aria-label="Retention cohorts"
        tabIndex={0}
        className="max-h-96 max-w-full overflow-auto rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
      >
        <table className="w-full text-left text-sm tabular-nums">
          <caption className="pb-3 text-left font-medium">
            Verified activation cohorts
          </caption>
          <thead>
            <tr>
              {[
                "Cohort",
                "Month end",
                "Customers",
                "Retained",
                "Initial MRR",
                "Retained MRR",
                "Customer retention",
                "Gross retention",
                "Net retention",
                "Evidence",
              ].map((h) => (
                <th key={h} scope="col" className="whitespace-nowrap p-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.cohorts.map((c) => (
              <tr
                key={c.cohortMonth + c.month}
                className="border-t border-border"
              >
                <th scope="row" className="p-3">
                  {c.cohortMonth}
                </th>
                <td className="p-3">{c.month}</td>
                <td className="p-3">{c.customers}</td>
                <td className="p-3">{c.retainedCustomers ?? "Unavailable"}</td>
                <td className="whitespace-nowrap p-3">
                  {money(c.baselineMinor, data.currency)}
                </td>
                <td className="whitespace-nowrap p-3">
                  {money(c.retainedMinor, data.currency)}
                </td>
                {[
                  c.customerRetentionPercent,
                  c.grossRevenueRetentionPercent,
                  c.netRevenueRetentionPercent,
                ].map((v, i) => (
                  <td key={i} className="p-3">
                    {v === null ? "Unavailable" : v + "%"}
                  </td>
                ))}
                <td className="min-w-52 p-3">
                  {c.complete
                    ? "Verified cohort"
                    : c.reasons.map(human).join("; ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="min-w-0 rounded-lg border border-border p-4">
        <summary className="cursor-pointer font-medium">
          Evidence reconciliation · {data.reconciliation.issueCount} issues
        </summary>
        <p className="mt-3 text-sm">
          Read-only review. Original invoices remain unchanged.{" "}
          {data.reconciliation.truncated
            ? "Source limit exceeded: historical results are unavailable."
            : `Source limit: ${data.reconciliation.sourceLimit} per collection.`}
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {Object.entries(data.reconciliation.counts).map(([code, count]) => (
            <li key={code} className="capitalize">
              {human(code)}: {count}
            </li>
          ))}
        </ul>
        <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
          {data.reconciliation.issues.map((issue, i) => (
            <li key={i} className="break-all">
              {human(issue.code)} · Organization{" "}
              {issue.organizationId ?? "unknown"} · Source{" "}
              {issue.sourceId ?? "unavailable"}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs">
          Showing at most {data.reconciliation.issueLimit} issues.{" "}
          {data.agentRestriction}
        </p>
      </details>
    </div>
  );
}
