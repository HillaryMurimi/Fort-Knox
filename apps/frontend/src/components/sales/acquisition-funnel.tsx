"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { Alert, Button } from "@/components/ui";
interface Funnel {
  public: {
    sessions: number;
    landing: number;
    demoStarted: number;
    demoCompleted: number;
    planSelected: number;
    signupStarted: number;
  };
  accounts: {
    accounts: number;
    verified: number;
    checkouts: number;
    verifiedPayments: number;
    activations: number;
    properties: number;
    units: number;
    imports: number;
    firstValue: number;
  };
  conversion: {
    accountToPaidRate: number | null;
    activationRate: number | null;
    firstValueRate: number | null;
  };
  linkedVisitorConversion: {
    sessions: number;
    verifiedPaid: number;
    rate: number | null;
  };
  bottlenecks: Array<{ _id: string; count: number }>;
  revenue: Array<{
    currency: string;
    organizations: number;
    mrrMinor: string;
    arrMinor: string;
  }>;
  timeToFirstValue: {
    observations: number;
    meanMs: number;
    minimumMs: number;
    maximumMs: number;
  } | null;
  items: Array<{
    _id: string;
    name: string;
    stage: string;
    source: string;
    attentionCode?: string;
  }>;
  recovery: { enabled: boolean; operationalApprovalRequired: boolean };
  limitations: string[];
  total: number;
}
const rate = (value: number | null) =>
  value === null ? "Unavailable" : value + "%";
export function AcquisitionFunnel() {
  const auth = useAuth(),
    [days, setDays] = useState(30),
    [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["acquisition-funnel", auth.user?._id, days, page],
    queryFn: () =>
      api<Funnel>(
        "/platform-control/acquisition-funnel?days=" + days + "&page=" + page,
      ),
    enabled: auth.roles.includes("SUPER_ADMIN") && !auth.isDevMode,
  });
  const data = query.data;
  return (
    <section
      className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-5"
      aria-labelledby="acquisition-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="acquisition-title" className="text-xl font-semibold">
            Self-service acquisition
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            One signup cohort. Payment, activation and setup are server
            evidenced.
          </p>
        </div>
        <label className="text-sm">
          Signup window{" "}
          <select
            className="ml-2 rounded border border-border bg-card p-2"
            value={days}
            onChange={(event) => {
              setDays(Number(event.target.value));
              setPage(1);
            }}
          >
            {[7, 30, 90, 365].map((n) => (
              <option key={n} value={n}>
                {n} days
              </option>
            ))}
          </select>
        </label>
      </div>
      {query.isLoading && <p role="status">Loading acquisition evidence…</p>}
      {query.error && (
        <Alert tone="destructive">
          {query.error.message}
          <Button variant="link" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </Alert>
      )}
      {data && (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {Object.entries(data.accounts).map(([key, value]) => (
              <div key={key} className="rounded-xl border border-border p-3">
                <dt className="text-xs text-muted-foreground">
                  {
                    (
                      {
                        accounts: "Registered",
                        verified: "Email verified",
                        checkouts: "Checkout started",
                        verifiedPayments: "Verified payments",
                        activations: "Activated",
                        properties: "First property",
                        units: "Units saved",
                        imports: "Bulk import",
                        firstValue: "First value",
                      } as Record<string, string>
                    )[key]
                  }
                </dt>
                <dd className="mt-2 text-2xl font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm">
            Account → paid: {rate(data.conversion.accountToPaidRate)} ·
            Activation: {rate(data.conversion.activationRate)} · Activated →
            first value: {rate(data.conversion.firstValueRate)}
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="font-semibold">Public session reports</h3>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                {Object.entries(data.public).map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-muted-foreground">
                      {key.replace(/([A-Z])/g, " $1")}
                    </dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                Linked landing sessions → verified paid:{" "}
                {rate(data.linkedVisitorConversion.rate)} (
                {data.linkedVisitorConversion.verifiedPaid}/
                {data.linkedVisitorConversion.sessions}). Anonymous activity is
                not a count of people.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">
                Time from verified payment to first value
              </h3>
              <p className="mt-3">
                {data.timeToFirstValue
                  ? Math.round(data.timeToFirstValue.meanMs / 60000) +
                    " minutes mean · " +
                    data.timeToFirstValue.observations +
                    " observations"
                  : "No eligible dashboard visits recorded yet."}
              </p>
              <h3 className="mt-4 font-semibold">Current blockers</h3>
              <ul className="mt-2 text-sm space-y-1">
                {data.bottlenecks.map((row) => (
                  <li key={row._id}>
                    {row._id.replaceAll("_", " ")}: {row.count}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div>
            <h3 className="font-semibold">
              Verified active contracted revenue
            </h3>
            {data.revenue.length ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th className="p-2">Currency</th>
                      <th className="p-2">Active paid</th>
                      <th className="p-2">MRR (minor units)</th>
                      <th className="p-2">ARR (minor units)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.revenue.map((row) => (
                      <tr key={row.currency}>
                        <td className="p-2">{row.currency}</td>
                        <td className="p-2">{row.organizations}</td>
                        <td className="p-2">{row.mrrMinor}</td>
                        <td className="p-2">{row.arrMinor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No active verified recurring revenue in this cohort.
              </p>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <caption className="mb-2 text-left font-semibold">
                Workspace bottlenecks
              </caption>
              <thead>
                <tr>
                  <th className="p-2">Workspace</th>
                  <th className="p-2">Source</th>
                  <th className="p-2">Next stage</th>
                  <th className="p-2">Attention</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row._id} className="border-t border-border">
                    <td className="p-2">{row.name}</td>
                    <td className="p-2">{row.source}</td>
                    <td className="p-2">{row.stage.replaceAll("_", " ")}</td>
                    <td className="p-2">{row.attentionCode ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex gap-3">
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span className="py-2 text-sm">Page {page}</span>
              <Button
                variant="outline"
                disabled={page * 20 >= data.total}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
          <p className="text-sm">
            Recovery emails:{" "}
            {data.recovery.enabled
              ? "operationally configured; consent and preferences required"
              : "OFF — operational authorization required"}
            .
          </p>
          <details className="text-sm text-muted-foreground">
            <summary className="cursor-pointer">
              Metric definitions and limitations
            </summary>
            <ul className="mt-3 list-disc pl-5 space-y-2">
              {data.limitations.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
