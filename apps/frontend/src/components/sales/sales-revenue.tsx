"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Alert, Button } from "@/components/ui";
import {
  revenueClient as client,
  revenueMoney as money,
  type RevenueTarget,
  type TargetDetail,
} from "@/lib/data/sales-revenue";
import { SalesRevenueTargetForm } from "./sales-revenue-target-form";
const panel = "rounded-2xl border border-border bg-card p-5 sm:p-7";
const input =
  "mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm";
const human = (text: string) => text.replaceAll("_", " ");
export function SalesRevenue() {
  const auth = useAuth(),
    cache = useQueryClient();
  const allowed = !auth.isDevMode && auth.roles.includes("SUPER_ADMIN");
  const [selection, setSelection] = useState<{
    from: string;
    to: string;
    currency: string;
  } | null>(null);
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState("");
  const [editing, setEditing] = useState<RevenueTarget | "NEW" | null>(null);
  function currentMonth() {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Nairobi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    setSelection({
      from: today.slice(0, 7) + "-01",
      to: today,
      currency: "KES",
    });
  }
  const key = ["sales-revenue", auth.user?._id, allowed];
  const overview = useQuery({
    queryKey: [...key, "overview", selection],
    queryFn: () => client.overview(selection!),
    enabled: allowed && !!selection,
    retry: false,
  });
  const targets = useQuery({
    queryKey: [...key, "targets", page],
    queryFn: () => client.targets(page),
    enabled: allowed,
    retry: false,
  });
  const detail = useQuery({
    queryKey: [...key, "target", selected],
    queryFn: () => client.target(selected),
    enabled: allowed && !!selected,
    retry: false,
  });
  if (!allowed)
    return (
      <Alert>Revenue intelligence requires a real SUPER_ADMIN session.</Alert>
    );
  const data = !overview.error ? overview.data : undefined;
  const targetDetail = !detail.error ? detail.data : undefined;
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Dapinni · Revenue intelligence
          </p>
          <h2 className="mt-2 text-3xl font-medium">Revenue Command Center</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Gross collections, current recurring value and deliberate growth
            targets. Every figure carries its evidence boundary.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            void cache.invalidateQueries({ queryKey: ["sales-revenue"] })
          }
        >
          Refresh evidence
        </Button>
      </header>
      <form
        key={JSON.stringify(selection)}
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setSelection({
            from: String(f.get("from")),
            to: String(f.get("to")),
            currency: String(f.get("currency")),
          });
        }}
      >
        <label className="text-sm">
          From (Nairobi)
          <input
            className={input}
            name="from"
            type="date"
            defaultValue={selection?.from ?? ""}
            required
          />
        </label>
        <label className="text-sm">
          Through (Nairobi)
          <input
            className={input}
            name="to"
            type="date"
            defaultValue={selection?.to ?? ""}
            required
          />
        </label>
        <label className="text-sm">
          Reporting currency
          <select
            className={input}
            name="currency"
            defaultValue={selection?.currency ?? "KES"}
          >
            {["KES", "USD", "NGN", "GHS", "ZAR"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <Button type="submit">Apply period</Button>
        <Button type="button" variant="outline" onClick={currentMonth}>
          Current month
        </Button>
      </form>
      {!selection && (
        <p className="text-sm text-muted-foreground">
          Choose a reporting period or open the current month.
        </p>
      )}
      {overview.isLoading && <p role="status">Loading revenue evidence…</p>}
      {overview.error && (
        <Alert>
          {overview.error.message}{" "}
          <Button variant="link" onClick={() => void overview.refetch()}>
            Retry revenue
          </Button>
        </Alert>
      )}
      {data && (
        <>
          <p className="text-xs text-muted-foreground">
            Evidence as of {data.asOf}. Cash follows the selected period;
            recurring values are current snapshots.
          </p>
          <Alert>
            Evidence-qualified totals: invoices missing payment proof, signed
            contracts or integer totals are excluded, including legacy renewal
            records. Zero means no qualifying evidence. Provider reconciliation,
            refunds and fees are not included.
          </Alert>
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr]">
            {[
              [
                "Gross verified cash",
                data.cash,
                "Qualifying paid invoices in period",
              ],
              [
                "Current MRR",
                data.currentMRR,
                "Paid active subscriptions, once per organization",
              ],
              [
                "Current ARR",
                data.currentARR,
                "Annualized MRR; not cash or a forecast",
              ],
            ].map(([label, raw, description]) => {
              const metric = raw as { amountMinor: string; count: number };
              return (
                <section key={String(label)} className={panel}>
                  <h3 className="text-sm text-muted-foreground">
                    {String(label)}
                  </h3>
                  <p className="mt-4 break-words text-3xl font-medium tabular-nums">
                    {money(metric.amountMinor, data.currency)}
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {String(description)} · {metric.count} records
                  </p>
                </section>
              );
            })}
          </div>
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <section className={panel}>
              <h3 className="text-lg font-medium">
                Daily verified collections
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Only dates with qualifying receipts are shown.
              </p>
              {data.dailyCash.length ? (
                <div className="mt-5 max-h-80 space-y-3 overflow-auto">
                  {data.dailyCash.map((day) => {
                    const total = BigInt(data.cash.amountMinor),
                      ratio =
                        total > BigInt(0)
                          ? Number(
                              (BigInt(day.amountMinor) * BigInt(10000)) / total,
                            ) / 100
                          : 0;
                    return (
                      <div key={day.day}>
                        <div className="flex justify-between gap-4 text-sm">
                          <span>{day.day}</span>
                          <span className="tabular-nums">
                            {money(day.amountMinor, data.currency)}
                          </span>
                        </div>
                        <div aria-hidden className="mt-2 h-1 rounded bg-muted">
                          <div
                            className="h-1 rounded bg-primary/60"
                            style={{ width: `${ratio}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-5 text-sm">
                  No qualifying payment evidence in this period.
                </p>
              )}
            </section>
            <section className={panel}>
              <h3 className="text-lg font-medium">Campaign contribution</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Registration attribution · top 20 by cash · not summed agent
                credit
              </p>
              <ul className="mt-5 space-y-3">
                {data.campaigns.map((c) => (
                  <li
                    key={c.campaignId ?? "unattributed"}
                    className="flex flex-wrap justify-between gap-2 text-sm"
                  >
                    <span className="break-all">
                      {c.campaignId ?? "Unattributed"}
                    </span>
                    <span className="tabular-nums">
                      {money(c.amountMinor, data.currency)}
                    </span>
                  </li>
                ))}
              </ul>
              {!data.campaigns.length && (
                <p className="mt-4 text-sm">No campaign receipts to report.</p>
              )}
            </section>
          </div>
          <details className={panel}>
            <summary className="cursor-pointer font-medium">
              Evidence quality &amp; unavailable metrics
            </summary>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              {data.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <p className="mt-4 text-sm">
              Unavailable: {data.unavailable.join("; ")}.
            </p>
          </details>
          <section className={panel}>
            <h3 className="text-lg font-medium">CRM &amp; agent operations</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              All retained CRM records. Leads/runs/approvals/assistance created
              in the period; meetings scheduled in it; messages accepted in it.
              Statuses reflect now. These groups are not a conversion funnel.
            </p>
            <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-5">
              {(
                [
                  "pipeline",
                  "qualification",
                  "meetings",
                  "approvals",
                  "assistance",
                ] as const
              ).map((group) => (
                <div key={group}>
                  <h4 className="text-sm font-medium capitalize">
                    {group === "pipeline" ? "Lead stages" : group}
                  </h4>
                  <ul className="mt-3 space-y-2 text-xs">
                    {data.operations[group].map((c) => (
                      <li
                        key={c._id ?? "unknown"}
                        className="flex justify-between gap-2"
                      >
                        <span>{human(c._id ?? "Unknown")}</span>
                        <span>{c.count}</span>
                      </li>
                    ))}
                  </ul>
                  {!data.operations[group].length && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      No records
                    </p>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="mb-3 text-left font-medium">
                  Message evidence · estimates in micro-USD
                </caption>
                <thead>
                  <tr>
                    {[
                      "Channel",
                      "Accepted",
                      "Delivered",
                      "Correlated replies",
                      "Estimated cost",
                    ].map((h) => (
                      <th className="p-2" key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.operations.messages.map((m) => (
                    <tr key={m.channel} className="border-t border-border">
                      <td className="p-2">{m.channel}</td>
                      <td>{m.accepted}</td>
                      <td>{m.delivered}</td>
                      <td>{m.replied}</td>
                      <td>{m.estimatedCostMicroUsd}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="mb-3 text-left font-medium">
                  Agent outcomes · estimated costs, not profitability
                </caption>
                <thead>
                  <tr>
                    {[
                      "Agent",
                      "Status",
                      "Runs",
                      "Estimated micro-USD",
                      "Runs with unknown cost",
                    ].map((h) => (
                      <th className="p-2" key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.operations.agents.map((a) => (
                    <tr key={a.agent + a.status} className="border-t border-border">
                      <td className="p-2">{human(a.agent)}</td>
                      <td>{human(a.status)}</td>
                      <td>{a.count}</td>
                      <td>{a.estimatedCostMicroUsd}</td>
                      <td>{a.unknownCostRuns}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      <section className={panel + " space-y-5"}>
        <div className="flex flex-wrap justify-between gap-3">
          <h3 className="text-xl font-medium">Revenue targets</h3>
          <Button onClick={() => setEditing("NEW")}>New target</Button>
        </div>
        {targets.isLoading && <p role="status">Loading targets…</p>}
        {targets.error && (
          <Alert>
            {targets.error.message}{" "}
            <Button variant="link" onClick={() => void targets.refetch()}>
              Retry targets
            </Button>
          </Alert>
        )}
        {!targets.error && targets.data?.total === 0 && (
          <p className="text-sm text-muted-foreground">
            No targets configured. Choose a metric, calendar period and baseline
            to start.
          </p>
        )}
        {!targets.error && (
          <div className="flex flex-wrap gap-2">
            {targets.data?.items.map((t) => (
              <Button
                variant={selected === t._id ? "default" : "outline"}
                className="h-auto min-h-10 max-w-full whitespace-normal break-words [overflow-wrap:anywhere]"
                key={t._id}
                aria-pressed={selected === t._id}
                onClick={() => {
                  setSelected(t._id);
                  setEditing(null);
                }}
              >
                {t.policy.name} · {t.policy.periodStart}
              </Button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous targets
          </Button>
          <span className="text-xs">Page {page}</span>
          <Button
            variant="outline"
            disabled={!targets.data || page * 20 >= targets.data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next targets
          </Button>
        </div>
        {detail.isLoading && <p role="status">Evaluating target evidence…</p>}
        {detail.error && (
          <Alert>
            {detail.error.message}{" "}
            <Button variant="link" onClick={() => void detail.refetch()}>
              Retry target
            </Button>
          </Alert>
        )}
        {targetDetail && (
          <>
            <RevenueTargetResult detail={targetDetail} />
            <Button
              variant="outline"
              onClick={() => setEditing(targetDetail.target)}
            >
              Revise target
            </Button>
          </>
        )}
        {editing && (
          <div className="border-t border-border pt-5">
            <div className="mb-4 flex justify-between gap-3">
              <h4 className="text-lg font-medium">
                {editing === "NEW"
                  ? "Configure a target"
                  : "Revise target assumptions"}
              </h4>
              <Button variant="outline" onClick={() => setEditing(null)}>
                Close editor
              </Button>
            </div>
            <SalesRevenueTargetForm
              key={editing === "NEW" ? "new" : editing._id + editing.revision}
              {...(editing === "NEW" ? {} : { target: editing })}
              saved={async (id) => {
                await cache.invalidateQueries({ queryKey: ["sales-revenue"] });
                setSelected(id);
                setEditing(null);
              }}
            />
          </div>
        )}
      </section>
    </div>
  );
}
export function RevenueTargetResult({ detail: d }: { detail: TargetDetail }) {
  const p = d.target.policy;
  return (
    <div className="space-y-4 border-t border-border pt-5">
      <h4 className="text-lg font-medium">{p.name}</h4>
      <p className="text-sm text-muted-foreground">
        {human(p.metric)} · {p.scope} {p.scopeId} · {p.periodStart} · revision{" "}
        {d.target.revision}
      </p>
      <p className="text-xl tabular-nums">
        Actual: {money(d.actualMinor, p.currency)}
      </p>
      {d.unavailableReason && <Alert>{d.unavailableReason}</Alert>}
      <p className="text-xs text-muted-foreground">
        Actuals use qualifying recorded evidence only. Missing billing proof,
        contracts and immutable amounts are excluded; provider completeness,
        refunds and fees are not certified. Recurring values are current snapshots.
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {d.levels.map((l) => (
          <div className="rounded-xl border border-border p-4" key={l.multiplier}>
            <p className="text-xs text-muted-foreground">
              {l.multiplier === 1 ? "Base" : `${l.multiplier}×`} quota
            </p>
            <p className="mt-2 break-words font-medium tabular-nums">
              {money(l.quotaMinor, p.currency)}
            </p>
            <p className="mt-2 text-sm">
              {l.attainmentPercent === null
                ? "Attainment unavailable"
                : `${l.attainmentPercent}% attained`}
            </p>
          </div>
        ))}
      </div>
      <p className="text-sm">
        Variance from base: {money(d.varianceMinor, p.currency)}. Required
        pipeline assumption: {money(d.requiredPipelineMinor, p.currency)}.
        Actual monetary pipeline coverage is unavailable.
      </p>
      {d.forecast ? (
        <Alert title="Administrator forecast · estimate">
          <p>
            {money(d.forecast.amountMinor, p.currency)} ·{" "}
            {d.forecast.attainmentPercent}% of base
          </p>
          <p className="mt-2 whitespace-pre-wrap">{d.forecast.rationale}</p>
        </Alert>
      ) : (
        <p className="text-sm text-muted-foreground">No forecast entered.</p>
      )}
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          Audit history · latest 20 revisions
        </summary>
        <ol className="mt-3 space-y-3 text-sm">
          {d.history.map((h) => (
            <li className="rounded-lg border border-border p-3" key={h._id}>
              <p>
                Revision {h.metadata.revision} · {h.createdAt}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{h.metadata.reason}</p>
              <p className="mt-1">
                Base:{" "}
                {h.metadata.before
                  ? money(
                      h.metadata.before.baselineMinor,
                      h.metadata.before.currency,
                    ) + " → "
                  : ""}
                {money(
                  h.metadata.after.baselineMinor,
                  h.metadata.after.currency,
                )}
              </p>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
