export interface MovementEvidence {
  id: string;
  organizationId: string;
  subscriptionId: string;
  sequence: number;
  kind: string;
  currency: string;
  effectiveAt: string;
  recordedAt: string;
  previousMinor: string | null;
  newMinor: string;
  paidThrough?: string;
  completeFromStart: boolean;
  gaps: string[];
  sourceKey: string;
  sourceKind: string;
  sourceReference: string;
  invoiceId?: string;
  contractId?: string;
  billingEventId?: string;
  webhookEventId?: string;
  previousEventId?: string;
}
export interface EvidenceGap {
  code: string;
  organizationId?: string;
  sourceId?: string;
  effectiveAt?: string;
}
export const monthStart = (month: string) =>
  new Date(`${month}-01T00:00:00+03:00`);
export function nextMonth(month: string, offset = 1) {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, m! - 1 + offset, 1))
    .toISOString()
    .slice(0, 7);
}
const amount = (value: string) => {
  if (!/^(0|[1-9][0-9]{0,29})$/.test(value))
    throw new Error("INVALID_MOVEMENT_MONEY");
  return BigInt(value);
};
const percent = (n: bigint, d: bigint) =>
  d === 0n
    ? null
    : `${(n * 10000n) / d / 100n}.${String(((n * 10000n) / d) % 100n).padStart(2, "0")}`;
function stateAt(events: MovementEvidence[], at: number) {
  return events.filter((e) => Date.parse(e.effectiveAt) < at).at(-1);
}
function streamGaps(events: MovementEvidence[], at: number): string[] {
  const observed = events.filter((e) => Date.parse(e.effectiveAt) < at);
  if (!observed.length) return [];
  const reasons = new Set<string>();
  let prior: MovementEvidence | undefined;
  for (const e of observed) {
    if (!e.completeFromStart || e.previousMinor === null)
      reasons.add("OPENING_HISTORY_MISSING");
    e.gaps.forEach((g) => reasons.add(g));
    if (
      e.sequence !== (prior?.sequence ?? 0) + 1 ||
      (prior &&
        (e.previousMinor !== prior.newMinor ||
          e.currency !== prior.currency ||
          Date.parse(e.effectiveAt) <= Date.parse(prior.effectiveAt)))
    )
      reasons.add("MOVEMENT_CHAIN_INVALID");
    if (prior ? e.previousEventId !== prior.id : !!e.previousEventId)
      reasons.add("MOVEMENT_LINK_INVALID");
    if (!prior && (e.kind !== "ACTIVATION" || e.previousMinor !== "0"))
      reasons.add("OPENING_HISTORY_MISSING");
    try {
      const before = amount(e.previousMinor ?? "0"),
        after = amount(e.newMinor);
      if (
        (["CANCELLATION", "EXPIRATION"].includes(e.kind) && after !== 0n) ||
        (e.kind === "EXPANSION" && after <= before) ||
        (e.kind === "CONTRACTION" && after >= before) ||
        (e.kind === "RENEWAL" && after !== before) ||
        (["ACTIVATION", "REACTIVATION"].includes(e.kind) && before !== 0n)
      )
        reasons.add("MOVEMENT_AMOUNT_INVALID");
    } catch {
      reasons.add("MOVEMENT_AMOUNT_INVALID");
    }
    prior = e;
  }
  if (
    prior?.newMinor !== "0" &&
    (!prior?.paidThrough || Date.parse(prior.paidThrough) < at)
  )
    reasons.add("PAID_TERM_BOUNDARY_UNRECORDED");
  return [...reasons];
}

/** Exact, deterministic read model; no catalog, forecast or current-price inference. */
export function deriveRevenueHistory(
  events: MovementEvidence[],
  gaps: EvidenceGap[],
  from: string,
  to: string,
  currency: string,
  now: Date,
  truncated = false,
) {
  const streams = new Map<string, MovementEvidence[]>();
  for (const e of events
    .filter(
      (e) =>
        e.currency === currency && Date.parse(e.recordedAt) <= now.getTime(),
    )
    .sort((a, b) => a.sequence - b.sequence)) {
    const key = e.organizationId;
    streams.set(key, [...(streams.get(key) ?? []), e]);
  }
  const relevantGaps = (at: number, org?: string) =>
    gaps
      .filter(
        (g) =>
          (!org || !g.organizationId || g.organizationId === org) &&
          (!g.effectiveAt || Date.parse(g.effectiveAt) < at),
      )
      .map((g) => g.code);
  const months: string[] = [];
  for (let m = from; m <= to && months.length < 24; m = nextMonth(m))
    months.push(m);
  const bridges = months.map((month) => {
    const start = monthStart(month).getTime(),
      end = monthStart(nextMonth(month)).getTime();
    const reasons = new Set(relevantGaps(end));
    if (end > now.getTime()) reasons.add("PERIOD_NOT_CLOSED");
    if (truncated) reasons.add("SOURCE_LIMIT_EXCEEDED");
    if (!events.length) reasons.add("NO_LEDGER_BASELINE");
    if (
      !events.some(
        (e) => e.currency === currency && Date.parse(e.effectiveAt) < end,
      )
    )
      reasons.add("PERIOD_BEFORE_LEDGER_COVERAGE");
    let opening = 0n,
      closing = 0n,
      fresh = 0n,
      reactivation = 0n,
      expansion = 0n,
      contraction = 0n,
      churn = 0n;
    for (const stream of streams.values()) {
      streamGaps(stream, end).forEach((r) => reasons.add(r));
      if (reasons.size) continue;
      opening += amount(stateAt(stream, start)?.newMinor ?? "0");
      closing += amount(stateAt(stream, end)?.newMinor ?? "0");
      for (const e of stream.filter(
        (e) =>
          Date.parse(e.effectiveAt) >= start && Date.parse(e.effectiveAt) < end,
      )) {
        const before = amount(e.previousMinor ?? "0"),
          after = amount(e.newMinor);
        if (e.kind === "ACTIVATION") fresh += after;
        else if (e.kind === "REACTIVATION") reactivation += after;
        else if (e.kind === "EXPANSION") expansion += after - before;
        else if (e.kind === "CONTRACTION") contraction += before - after;
        else if (["CANCELLATION", "EXPIRATION"].includes(e.kind))
          churn += before;
      }
    }
    if (
      !reasons.size &&
      opening + fresh + reactivation + expansion - contraction - churn !==
        closing
    )
      reasons.add("BRIDGE_DOES_NOT_RECONCILE");
    const complete = reasons.size === 0;
    return {
      month,
      complete,
      reasons: [...reasons],
      openingMinor: complete ? String(opening) : null,
      newMinor: complete ? String(fresh) : null,
      reactivationMinor: complete ? String(reactivation) : null,
      expansionMinor: complete ? String(expansion) : null,
      contractionMinor: complete ? String(contraction) : null,
      churnedMinor: complete ? String(churn) : null,
      closingMinor: complete ? String(closing) : null,
      reconciled: complete,
    };
  });
  const cohorts = months.flatMap((cohortMonth) => {
    const members = [...streams.values()].filter(
      (s) =>
        s[0]?.kind === "ACTIVATION" &&
        s[0]?.completeFromStart &&
        Date.parse(s[0].effectiveAt) >= monthStart(cohortMonth).getTime() &&
        Date.parse(s[0].effectiveAt) <
          monthStart(nextMonth(cohortMonth)).getTime(),
    );
    return months
      .filter((m) => m >= cohortMonth)
      .map((month) => {
        const end = monthStart(nextMonth(month)).getTime(),
          reasons = new Set<string>();
        if (!members.length) reasons.add("NO_VERIFIED_COHORT");
        if (end > now.getTime()) reasons.add("PERIOD_NOT_CLOSED");
        if (truncated) reasons.add("SOURCE_LIMIT_EXCEEDED");
        let baseline = 0n,
          retained = 0n,
          capped = 0n,
          customers = 0;
        for (const stream of members) {
          streamGaps(stream, end).forEach((r) => reasons.add(r));
          relevantGaps(end, stream[0]!.organizationId).forEach((r) =>
            reasons.add(r),
          );
          if (reasons.size) continue;
          const first = amount(stream[0]!.newMinor),
            current = amount(stateAt(stream, end)?.newMinor ?? "0");
          baseline += first;
          retained += current;
          capped += current < first ? current : first;
          if (current > 0n) customers++;
        }
        const complete = reasons.size === 0;
        return {
          cohortMonth,
          month,
          complete,
          reasons: [...reasons],
          customers: members.length,
          retainedCustomers: complete ? customers : null,
          baselineMinor: complete ? String(baseline) : null,
          retainedMinor: complete ? String(retained) : null,
          customerRetentionPercent: complete
            ? percent(BigInt(customers), BigInt(members.length))
            : null,
          grossRevenueRetentionPercent: complete
            ? percent(capped, baseline)
            : null,
          netRevenueRetentionPercent: complete
            ? percent(retained, baseline)
            : null,
        };
      });
  });
  return {
    bridges,
    cohorts,
    currency,
    timeZone: "Africa/Nairobi",
    asOf: now.toISOString(),
    definition:
      "Cohort = organization first verified activation month; baseline = first paid monthly recurring value. Retention is measured immediately before each Nairobi calendar month end. Reactivated customers count as retained at that boundary; expansion is capped per customer for gross retention. Percentages truncate to two decimals.",
    autonomousInterventionsEnabled: false as const,
    agentRestriction:
      "Read-only analytical evidence. Autonomous financial interventions and customer contact are not authorized by this report.",
  };
}
