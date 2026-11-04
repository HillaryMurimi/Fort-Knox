"use client";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import {
  decimalAmount,
  toMinor,
  revenueClient,
  type TargetPolicy,
  type RevenueTarget,
} from "@/lib/data/sales-revenue";
const field =
  "mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm";
const read = (data: FormData, key: string) =>
  String(data.get(key) ?? "").trim();
export function SalesRevenueTargetForm({
  target,
  saved,
}: {
  target?: RevenueTarget;
  saved: (id: string) => Promise<void>;
}) {
  const policy = target?.policy;
  const [scope, setScope] = useState<TargetPolicy["scope"]>(
    policy?.scope ?? "DEPARTMENT",
  );
  const [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState("");
  const command = useRef<{ payload: string; id: string } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setFeedback("");
    try {
      const forecast = read(data, "forecast");
      const next: TargetPolicy = {
        name: read(data, "name"),
        metric: read(data, "metric") as TargetPolicy["metric"],
        currency: read(data, "currency") as TargetPolicy["currency"],
        period: read(data, "period") as TargetPolicy["period"],
        periodStart: read(data, "periodStart"),
        baselineMinor: toMinor(read(data, "baseline")),
        scope,
        ...(scope !== "DEPARTMENT" ? { scopeId: read(data, "scopeId") } : {}),
        pipelineCoverageBps: Math.round(Number(read(data, "coverage")) * 10000),
        ...(forecast
          ? {
              forecastMinor: toMinor(forecast),
              forecastRationale: read(data, "rationale"),
            }
          : {}),
      };
      const reason = read(data, "reason"),
        payload = JSON.stringify({ policy: next, reason });
      // Retain the command across uncertain retries; edited payloads receive a new command.
      if (!command.current || command.current.payload !== payload)
        command.current = { payload, id: crypto.randomUUID() };
      const result = target
        ? await revenueClient.update(target._id, {
            revision: target.revision,
            policy: next,
            reason,
          })
        : await revenueClient.create({
            commandId: command.current.id,
            policy: next,
            reason,
          });
      await saved(result.id);
      setFeedback("Target saved and audited.");
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Unable to save. Retry with the same details.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="space-y-4" onSubmit={submit}>
      <p className="text-sm text-muted-foreground">
        Targets are planning assumptions, separate from customer prices and
        spending budgets. Saving requires recent dual-channel administrator
        verification.
      </p>
      {feedback && <p role="status">{feedback}</p>}
      <label className="block text-sm">
        Target name
        <input
          className={field}
          name="name"
          defaultValue={policy?.name}
          required
          minLength={3}
          maxLength={120}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          Metric
          <select
            name="metric"
            aria-label="Metric"
            className={field}
            defaultValue={policy?.metric ?? "COLLECTED_CASH"}
          >
            {[
              "COLLECTED_CASH",
              "CURRENT_MRR",
              "CURRENT_ARR",
              "NEW_MRR",
              "RECOGNIZED_REVENUE",
            ].map((m) => (
              <option key={m} value={m}>
                {m.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Currency
          <select
            name="currency"
            aria-label="Currency"
            className={field}
            defaultValue={policy?.currency ?? "KES"}
          >
            {["KES", "USD", "NGN", "GHS", "ZAR"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Period
          <select
            name="period"
            aria-label="Period"
            className={field}
            defaultValue={policy?.period ?? "MONTHLY"}
          >
            {["MONTHLY", "QUARTERLY", "ANNUAL"].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Calendar period start (Nairobi)
          <input
            className={field}
            name="periodStart"
            type="date"
            defaultValue={policy?.periodStart}
            required
          />
        </label>
        <label className="text-sm">
          Base quota (currency units)
          <input
            className={field}
            name="baseline"
            inputMode="decimal"
            defaultValue={policy ? decimalAmount(policy.baselineMinor) : ""}
            required
          />
        </label>
        <label className="text-sm">
          Required pipeline multiple
          <input
            className={field}
            name="coverage"
            type="number"
            min={1}
            max={100}
            step="0.01"
            defaultValue={policy ? policy.pipelineCoverageBps / 10000 : 3}
            required
          />
        </label>
        <label className="text-sm">
          Assignment
          <select
            className={field}
            value={scope}
            aria-label="Assignment"
            onChange={(e) => setScope(e.target.value as TargetPolicy["scope"])}
          >
            {["DEPARTMENT", "CAMPAIGN", "AGENT", "TEAM"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        {scope !== "DEPARTMENT" && (
          <label className="text-sm">
            {scope === "CAMPAIGN"
              ? "Campaign ID"
              : scope === "AGENT"
                ? "Agent key"
                : "Team reference"}
            {scope === "AGENT" ? (
              <select
                name="scopeId"
                aria-label="Agent key"
                className={field}
                defaultValue={policy?.scopeId}
              >
                {[
                  "LEAD_RESEARCHER",
                  "SALES_OUTREACH",
                  "MEETING_COORDINATOR",
                  "FOLLOW_UP",
                  "ONBOARDING_SUCCESS",
                  "CRM_INTELLIGENCE",
                ].map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            ) : (
              <input
                className={field}
                name="scopeId"
                required
                maxLength={120}
                defaultValue={policy?.scopeId}
                pattern={scope === "CAMPAIGN" ? "[a-fA-F0-9]{24}" : undefined}
              />
            )}
          </label>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Use the first day of a month, quarter or year. New MRR, recognized
        revenue and agent/team monetary actuals remain unavailable until their
        evidence sources exist.
      </p>
      <label className="block text-sm">
        Optional forecast (administrator estimate)
        <input
          className={field}
          name="forecast"
          inputMode="decimal"
          defaultValue={
            policy?.forecastMinor ? decimalAmount(policy.forecastMinor) : ""
          }
        />
      </label>
      <label className="block text-sm">
        Forecast assumptions
        <textarea
          className={field}
          name="rationale"
          minLength={20}
          maxLength={2000}
          defaultValue={policy?.forecastRationale}
        />
      </label>
      <label className="block text-sm">
        Reason for this target or revision
        <textarea
          className={field}
          name="reason"
          required
          minLength={20}
          maxLength={2000}
        />
      </label>
      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : target ? "Save target revision" : "Create target"}
      </Button>
    </form>
  );
}
