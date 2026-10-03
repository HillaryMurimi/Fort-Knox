"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { salesDemoClient as client } from "@/lib/data/sales-demo";
import { useAuth } from "@/hooks/use-auth";
import { StatusBadge,  Alert, Button } from "@/components/ui";
export function SalesIntelligenceView() {
  const auth = useAuth(),
    [page, setPage] = useState(1),
    data = useQuery({
      queryKey: ["sales-intelligence", page],
      queryFn: () => client.intelligence(page),
      enabled: auth.roles.includes("SUPER_ADMIN") && !auth.isDevMode,
    });
  if (!auth.roles.includes("SUPER_ADMIN") || auth.isDevMode)
    return (
      <Alert>Sales intelligence requires a real SUPER_ADMIN session.</Alert>
    );
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider">
            SUPER_ADMIN · sales intelligence
          </p>
          <h1 className="mt-2 text-3xl font-semibold">
            Which value moments create customers?
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Prospect cohorts, operational activation and verified commercial
            conversion.
          </p>
        </div>
        <Link href="/sales-demo" className="btn-primary">
          Prepare demonstration
        </Link>
      </header>
      {data.isLoading && (
        <p role="status">Loading prospect conversion evidence…</p>
      )}
      {data.error && (
        <Alert tone="destructive">
          {data.error.message}
          <Button variant="link" onClick={() => void data.refetch()}>
            Retry
          </Button>
        </Alert>
      )}
      {data.data && (
        <>
          <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {data.data.totals.map((t) => (
              <div
                key={t._id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <dt className="text-xs text-muted-foreground">
                  {t._id.replaceAll(".", " ")}
                </dt>
                <dd className="mt-2 text-3xl font-semibold">{t.count}</dd>
              </div>
            ))}
          </dl>
          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-xl font-semibold">
              Pain and scenario conversion
            </h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[750px] text-left text-sm">
                <caption className="sr-only">
                  Demo to pilot, activation and paid conversion by prospect
                  cohort
                </caption>
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    {[
                      "Pain / scenario",
                      "Plan",
                      "Prospects",
                      "Completed demos",
                      "Pilot offered",
                      "Pilots",
                      "Activation",
                      "Verified paid",
                      "Paid renewal",
                      "Demo → pilot",
                      "Pilot → paid",
                    ].map((h) => (
                      <th className="p-3" key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.data.cohorts.map((r, i) => (
                    <tr className="border-b border-border" key={i}>
                      <td className="p-3">
                        {r._id.pain}
                        <small className="block text-muted-foreground">
                          {r._id.scenario}
                        </small>
                      </td>
                      <td className="p-3">{r._id.plan.replaceAll("_", " ")}</td>
                      <td className="p-3">{r.prospects}</td>
                      <td className="p-3">{r.demos}</td>
                      <td className="p-3">{r.offered}</td>
                      <td className="p-3">{r.pilots}</td>
                      <td className="p-3">{r.activated}</td>
                      <td className="p-3">{r.paid}</td>
                      <td className="p-3">{r.retained}</td>
                      <td className="p-3">
                        {r.demos
                          ? `${Math.round((r.pilots / r.demos) * 100)}%`
                          : "—"}
                      </td>
                      <td className="p-3">
                        {r.pilots
                          ? `${Math.round((r.paid / r.pilots) * 100)}%`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.data.cohorts.length && (
                <p className="mt-4 text-sm text-muted-foreground">
                  No demonstrations prepared yet.
                </p>
              )}
            </div>
          </section>
          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-xl font-semibold">Meaningful value moments</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[500px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="p-3">Business evidence</th>
                    <th className="p-3">Prospects reached</th>
                    <th className="p-3">Pilots</th>
                    <th className="p-3">Verified paid</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.valueMoments.map((m) => (
                    <tr key={m._id} className="border-b border-border">
                      <td className="p-3">{m._id.replaceAll(".", " ")}</td>
                      <td className="p-3">{m.prospectsReached}</td>
                      <td className="p-3">{m.pilots}</td>
                      <td className="p-3">{m.paid}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-xl font-semibold">Activation blockers</h2>
            <ul className="mt-4 space-y-3">
              {data.data.items.map((lead) => (
                <li
                  key={lead.id}
                  className="flex flex-wrap justify-between gap-4 rounded-xl border border-border p-4"
                >
                  <div>
                    <strong>{lead.name}</strong>
                    <p className="mt-1 text-sm">
                      {lead.profile.primaryPain} ·{" "}
                      {lead.profile.plan.replaceAll("_", " ")} · <StatusBadge status={lead.stage} domain="sales" />
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Commercial stage:{" "}
                      {lead.commercialState.replaceAll("_", " ")} · operational
                      milestone:{" "}
                      {lead.activationMilestone ? "reached" : "pending"}
                      {lead.blocker ? ` · ${lead.blocker}` : ""}
                    </p>
                  </div>
                  {lead.readinessPercent !== undefined && (
                    <p className="text-sm font-semibold">
                      {lead.readinessPercent}% ready ·{" "}
                      {lead.nextAction ?? "Operational milestone reached"}
                    </p>
                  )}
                  {lead.pilotOrganizationId && (
                    <Link
                      href={`/pilot?organizationId=${lead.pilotOrganizationId}`}
                      className="btn-secondary"
                    >
                      Inspect pilot readiness
                    </Link>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex items-center gap-3">
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span className="text-sm">
                Page {page} · {data.data.total} prospects
              </span>
              <Button
                variant="outline"
                disabled={page * 20 >= data.data.total}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </section>
          {data.data.limitations.map((text) => (
            <p className="text-xs text-muted-foreground" key={text}>
              {text}
            </p>
          ))}
        </>
      )}
    </div>
  );
}
