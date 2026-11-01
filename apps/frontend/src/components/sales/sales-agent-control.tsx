"use client";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SalesResearchEvidence } from "./sales-research-evidence";
import { useAuth } from "@/hooks/use-auth";
import { Alert, Button, StatusBadge } from "@/components/ui";
import {
  salesAgentClient as client,
  type AgentDefinition,
} from "@/lib/data/sales-agents";
const panel = "space-y-4 rounded-2xl border border-border bg-card p-5";
const field =
  "mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm";
export function SalesAgentControl({ leadId }: { leadId?: string | undefined }) {
  const auth = useAuth(),
    cache = useQueryClient();
  const admin = auth.roles.includes("SUPER_ADMIN") && !auth.isDevMode;
  const can = (p: string) =>
    !auth.isDevMode &&
    (admin || auth.memberships.some((m) => m.permissions.includes(p)));
  const accessKey =
    auth.user?._id +
    ":" +
    auth.memberships.map((m) => m.permissions.join(",")).join("|");
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const catalog = useQuery({
    queryKey: ["sales-agents", accessKey, "catalog"],
    queryFn: client.catalog,
    enabled: can("sales.agents.read"),
  });
  const runs = useQuery({
    queryKey: ["sales-agents", accessKey, "runs", page],
    queryFn: () => client.list(page),
    enabled: can("sales.agents.read"),
    refetchInterval: 10000,
  });
  const detail = useQuery({
    queryKey: ["sales-agents", accessKey, "run", selected],
    queryFn: () => client.view(selected),
    enabled:
      !!selected &&
      can("sales.agents.read") &&
      can("sales.notes.read") &&
      can("sales.meetings.read"),
    refetchInterval: 5000,
  });
  async function act(work: () => Promise<unknown>) {
    setBusy(true);
    setMessage("");
    try {
      await work();
      await cache.invalidateQueries({ queryKey: ["sales-agents"] });
      setMessage("Saved. No message has been sent.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Operation failed");
    } finally {
      setBusy(false);
    }
  }
  if (!can("sales.agents.read"))
    return <Alert>Explicit agent-read permission is required.</Alert>;
  const current = detail.error ? undefined : detail.data;
  const displayedAction =
    current?.approval?.payload ?? current?.run.output?.action;
  return (
    <section className="space-y-5" aria-label="AI agent control center">
      <Alert>
        Agents prepare validated proposals for human review. Approval alone does
        not send outreach or book an external meeting. Missing integrations are
        reported explicitly.
      </Alert>
      {message && <p role="status">{message}</p>}
      {catalog.isLoading && <p role="status">Loading agent configuration…</p>}
      {catalog.error && (
        <Alert>
          {catalog.error.message}
          <Button variant="link" onClick={() => void catalog.refetch()}>
            Retry
          </Button>
        </Alert>
      )}
      {catalog.data && (
        <>
          <p className="text-sm text-muted-foreground">
            Outbound emergency control:{" "}
            {catalog.data.outboundSuspended ? "SUSPENDED" : "ENABLED"} · model:{" "}
            {catalog.data.integrations.ai}
            {' · research: '}{catalog.data.integrations.research}
          </p>
          <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
            {catalog.data.agents.map((a) => (
              <article className={panel} key={a.key}>
                <h2 className="text-lg font-semibold">{a.name}</h2>
                <p className="text-sm text-muted-foreground">{a.purpose}</p>
                <p className="text-xs font-semibold">
                  {a.status.replaceAll("_", " ")} · instructions v
                  {a.instructionVersion}
                </p>
                <p className="text-xs">
                  Allowed proposals: {a.tools.join(", ")}
                </p>
                {admin && (
                  <AgentConfig
                    key={`${a.key}-${a.config?.revision ?? 0}`}
                    agent={a}
                    busy={busy}
                    save={(body) => act(() => client.configure(a.key, body))}
                  />
                )}
                {can("sales.agents.execute") && (
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const d = new FormData(e.currentTarget);
                      void act(async () => {
                        const run = await client.create({
                          agent: a.key,
                          leadId: String(d.get("leadId")),
                          objective: String(d.get("objective")),
                          ...(String(d.get('researchQuery') ?? '').trim() ? { researchQuery: String(d.get('researchQuery')).trim() } : {}),
                          ...(String(d.get('calendarStartsAt') ?? '').trim() ? { calendarWindow: { representativeId: String(d.get('calendarRepresentativeId')), startsAt: String(d.get('calendarStartsAt')), endsAt: String(d.get('calendarEndsAt')) } } : {}),
                          commandId: crypto.randomUUID(),
                        });
                        setSelected(run.id);
                      });
                    }}
                  >
                    <label className="block text-sm">
                      Customer ID
                      <input
                        name="leadId"
                        defaultValue={leadId}
                        required
                        pattern="[a-fA-F0-9]{24}"
                        className={field}
                      />
                    </label>
                    <label className="block text-sm">
                      Task objective
                      <textarea
                        name="objective"
                        required
                        minLength={5}
                        maxLength={2000}
                        rows={3}
                        className={field}
                      />
                    </label>
                    {a.key === 'LEAD_RESEARCHER' && can('sales.research.execute') && <label className="block text-sm">Optional permitted-source search
                      <input name="researchQuery" className={field} minLength={3} maxLength={300} placeholder="Rental property management companies in Kenya" />
                      <span className="mt-1 block text-xs text-muted-foreground">Uses the configured licensed connector. Do not include private contact details. Source excerpts are unverified evidence for review.</span>
                    </label>}
                    {a.key === 'MEETING_COORDINATOR' && can('sales.meetings.create') && <fieldset className="min-w-0 space-y-2 rounded-lg border p-3"><legend className="text-sm">Optional actual calendar window</legend><label className="block text-sm">Representative ID<input name="calendarRepresentativeId" defaultValue={String(auth.user?._id ?? '')} pattern="[a-fA-F0-9]{24}" className={field}/></label><label className="block text-sm">Window starts (ISO time with offset)<input name="calendarStartsAt" className={field}/></label><label className="block text-sm">Window ends (ISO time with offset)<input name="calendarEndsAt" className={field}/></label><p className="text-xs">At most seven days. The coordinator checks the configured calendar and local holds; proposed slots still require human review and a fresh conflict check before booking.</p></fieldset>}
                    <Button
                      type="submit"
                      disabled={busy || !a.executionEnabled}
                    >
                      Queue task
                    </Button>
                  </form>
                )}
              </article>
            ))}
          </div>
        </>
      )}
      <section className={panel}>
        <h2 className="text-xl font-semibold">
          Execution history &amp; approvals
        </h2>
        {runs.isLoading && <p role="status">Loading persistent tasks…</p>}
        {runs.error && (
          <Alert>
            {runs.error.message}
            <Button variant="link" onClick={() => void runs.refetch()}>
              Retry
            </Button>
          </Alert>
        )}
        {runs.data?.total === 0 && (
          <p className="text-sm text-muted-foreground">
            No tasks yet. Enable a configured agent through the existing feature
            controls, select a customer and queue an objective.
          </p>
        )}
        <ul className="space-y-2">
          {runs.data?.items.map((run) => (
            <li key={run._id}>
              <button
                className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3 text-left focus-visible:outline focus-visible:outline-2"
                onClick={() => setSelected(run._id)}
                aria-pressed={selected === run._id}
              >
                <span>
                  {run.agent.replaceAll("_", " ")}
                  <small className="block text-muted-foreground">
                    {new Date(run.createdAt).toLocaleString()} · attempt{" "}
                    {run.attempt}
                  </small>
                </span>
                <StatusBadge status={run.status} domain="sales" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-sm">Page {page}</span>
          <Button
            variant="outline"
            disabled={!runs.data || page * 20 >= runs.data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </section>
      {detail.isLoading && selected && (
        <p role="status">Loading execution evidence…</p>
      )}
      {detail.error && <Alert>{detail.error.message}</Alert>}
      {current && (
        <section className={panel}>
          <h2 className="text-xl font-semibold">Execution detail</h2>
          <StatusBadge status={current.run.status} domain="sales" />
          <p className="whitespace-pre-wrap text-sm">{current.run.objective}</p>
          {current.run.errorCode && <Alert>{current.run.errorCode}</Alert>}
          <p className="text-xs text-muted-foreground">
            Tokens: {current.run.inputTokens ?? "Unknown"} input /{" "}
            {current.run.outputTokens ?? "Unknown"} output · cost:{" "}
            {current.run.costBasis === "CONFIGURED_RATE_ESTIMATE"
              ? `${current.run.costMicroUsd} micro USD (configured-rate estimate)`
              : "Unknown"}
          </p>
          {current.run.output && (
            <>
              <h3 className="font-semibold">
                AI suggestion · {current.run.output.confidence} confidence
              </h3>
              <p className="whitespace-pre-wrap text-sm">
                {current.run.output.summary}
              </p>
              <ul className="list-inside list-disc text-sm">
                {current.run.output.evidence.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
              <p className="text-sm text-muted-foreground">
                {current.run.output.limitation}
              </p>
              <h3 className="font-semibold">
                Proposed {displayedAction?.tool.replaceAll("_", " ")}
              </h3>
              {displayedAction?.subject && (
                <p className="font-medium">{displayedAction?.subject}</p>
              )}
              <p className="whitespace-pre-wrap break-words rounded-lg bg-muted p-4 text-sm">
                {displayedAction?.text}
              </p>
              <p className="text-sm">Reason: {displayedAction?.reason}</p>
            </>
          )}
          <SalesResearchEvidence run={current.run} approval={current.approval} canImport={admin} busy={busy}
            onImport={(id, body) => act(async () => { await client.importResearch(id, body); await cache.invalidateQueries({ queryKey: ['sales-success'] }); })} />
          {current.approval && (
            <>
              <p className="text-xs">
                Review: {current.approval.status} · {current.approval.risk} risk
                · expires{" "}
                {new Date(current.approval.expiresAt).toLocaleString()}
              </p>
              {admin && current.approval.status === "PENDING" && (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const d = new FormData(e.currentTarget);
                    const approval = current.approval;
                    if (approval)
                      void act(() =>
                        client.decide(approval._id, {
                          decision: String(d.get("decision")),
                          reason: String(d.get("reason")),
                          payloadHash: approval.payloadHash,
                        }),
                      );
                  }}
                >
                  <label className="block text-sm">
                    Decision
                    <select name="decision" className={field}>
                      {["APPROVE", "REJECT", "REQUEST_CHANGES", "CANCEL"].map(
                        (d) => (
                          <option key={d}>{d}</option>
                        ),
                      )}
                    </select>
                  </label>
                  <label className="block text-sm">
                    Review reason
                    <textarea
                      name="reason"
                      required
                      minLength={5}
                      maxLength={1000}
                      rows={3}
                      className={field}
                    />
                  </label>
                  <Button type="submit" disabled={busy}>
                    Record exact-payload decision
                  </Button>
                </form>
              )}
            </>
          )}
          {can("sales.agents.execute") &&
            !["COMPLETED", "CANCELLED"].includes(current.run.status) && (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = new FormData(e.currentTarget);
                  void act(() =>
                    client.control(current.run._id, {
                      action: String(d.get("action")),
                      reason: String(d.get("reason")),
                    }),
                  );
                }}
              >
                <label className="block text-sm">
                  Task control
                  <select name="action" className={field}>
                    {(current.run.status === "PAUSED" ||
                    current.run.status === "BLOCKED" ||
                    current.run.status === "FAILED"
                      ? ["RESUME", "CANCEL"]
                      : ["PAUSE", "CANCEL"]
                    ).map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  Control reason
                  <input
                    name="reason"
                    required
                    minLength={5}
                    maxLength={1000}
                    className={field}
                  />
                </label>
                <Button variant="outline" type="submit" disabled={busy}>
                  Apply task control
                </Button>
              </form>
            )}
        </section>
      )}
    </section>
  );
}
function AgentConfig({
  agent,
  busy,
  save,
}: {
  agent: AgentDefinition;
  busy: boolean;
  save: (body: unknown) => Promise<void>;
}) {
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    void save({
      revision: agent.config?.revision ?? 0,
      enabled: d.has("enabled"),
      paused: d.has("paused"),
      maxDailyRuns: Number(d.get("runs")),
      maxOutputTokens: Number(d.get("output")),
      maxDailyTokens: Number(d.get("tokens")),
      dailyBudgetMicroUsd: Number(d.get("budget")),
    });
  }
  return (
    <details>
      <summary className="cursor-pointer text-sm font-semibold">
        Configuration (step-up required)
      </summary>
      <form className="mt-3 space-y-3" onSubmit={submit}>
        <label className="flex gap-2 text-sm">
          <input
            name="enabled"
            type="checkbox"
            defaultChecked={agent.config?.enabled ?? false}
          />
          Enabled
        </label>
        <label className="flex gap-2 text-sm">
          <input
            name="paused"
            type="checkbox"
            defaultChecked={agent.config?.paused ?? true}
          />
          Paused
        </label>
        {[
          {
            name: "runs",
            label: "Daily runs",
            value: agent.config?.maxDailyRuns ?? 20,
            min: 1,
            max: 1000,
          },
          {
            name: "output",
            label: "Output token limit",
            value: agent.config?.maxOutputTokens ?? 1500,
            min: 256,
            max: 8000,
          },
          {
            name: "tokens",
            label: "Daily token reservation ceiling",
            value: agent.config?.maxDailyTokens ?? 50000,
            min: 256,
            max: 1000000,
          },
          {
            name: "budget",
            label: "Daily budget (micro USD)",
            value: agent.config?.dailyBudgetMicroUsd ?? 0,
            min: 0,
            max: 1000000000,
          },
        ].map((f) => (
          <label className="block text-sm" key={f.name}>
            {f.label}
            <input
              name={f.name}
              type="number"
              min={f.min}
              max={f.max}
              defaultValue={f.value}
              required
              className={field}
            />
          </label>
        ))}
        <Button type="submit" disabled={busy}>
          Save agent policy
        </Button>
      </form>
    </details>
  );
}
