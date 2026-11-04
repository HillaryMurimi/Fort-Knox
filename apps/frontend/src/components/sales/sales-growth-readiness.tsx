"use client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { Alert } from "@/components/ui";
import { revenueMoney } from '@/lib/data/sales-revenue';

type Readiness = {
  status: "REVIEW_REQUIRED";
  source: string;
  observedLeads: number;
  acceptedMessages: number;
  correlatedReplies: number;
  assistanceCases: number;
  recommendation: string;
  experiment: null;
  requiresApproval: true;
  limitations: string[];
};
type Overview = { growthIntelligence: Readiness; currentMRR: { amountMinor: string; count: number }; currency: string; unavailable: string[] };
function dates() {
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  const from = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  return { from, to };
}
export function SalesGrowthReadiness() {
  const auth = useAuth();
  const query = useQuery({
    queryKey: ["sales-growth-readiness", auth.user?._id, auth.roles.includes('SUPER_ADMIN'), auth.isDevMode, "KES"],
    queryFn: () => {
      const { from, to } = dates();
      return api<Overview>(`/sales/success/revenue?from=${from}&to=${to}&currency=KES`);
    },
    enabled: auth.roles.includes("SUPER_ADMIN") && !auth.isDevMode,
    retry: false,
  });
  if (!auth.roles.includes("SUPER_ADMIN") || auth.isDevMode) return null;
  return (
    <section aria-labelledby="growth-readiness-heading" className="rounded-2xl border border-border bg-card p-6 space-y-3">
      <h2 id="growth-readiness-heading" className="text-xl font-semibold">Revenue growth readiness</h2>
      <p className="text-sm text-muted-foreground">Read-only recommendations based on persisted CRM activity. No experiment or outreach runs automatically.</p>
      {query.isPending && <p role="status">Loading verified growth diagnostics…</p>}
      {query.error && <Alert tone="destructive">Growth diagnostics unavailable: {query.error.message}</Alert>}
      {!query.error && query.data && (
        <>
          <p className="text-sm">Current paid subscription snapshot: {revenueMoney(query.data.currentMRR.amountMinor, query.data.currency)} MRR across {query.data.currentMRR.count} organizations.</p>
          <dl className="grid gap-3 sm:grid-cols-4">
            {[
              ["CRM leads", query.data.growthIntelligence.observedLeads],
              ["Accepted messages", query.data.growthIntelligence.acceptedMessages],
              ["Correlated replies", query.data.growthIntelligence.correlatedReplies],
              ["Assistance cases", query.data.growthIntelligence.assistanceCases],
            ].map(([label, value]) => <div key={label} className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-xl font-semibold">{value}</dd></div>)}
          </dl>
          <p className="text-sm font-medium">Suggested next step (approval required): {query.data.growthIntelligence.recommendation}</p>
          <p className="text-xs text-muted-foreground">{query.data.growthIntelligence.limitations.join(" ")}</p>
        </>
      )}
    </section>
  );
}
