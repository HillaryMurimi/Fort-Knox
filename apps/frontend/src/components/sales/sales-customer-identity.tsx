"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Alert, Button, StatusBadge } from "@/components/ui";
import {
  salesIdentityClient as client,
  type MergePreview,
} from "@/lib/data/sales-identity";
import { successClient } from "@/lib/data/sales-success";
const field =
  "mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm";
export function SalesCustomerIdentity({
  id,
  revision,
  organizationId,
}: {
  id: string;
  revision: number;
  organizationId?: string | undefined;
}) {
  const auth = useAuth(),
    cache = useQueryClient(),
    admin = auth.roles.includes("SUPER_ADMIN") && !auth.isDevMode;
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [preview, setPreview] = useState<MergePreview | null>(null);
  const matches = useQuery({
    queryKey: ["sales-identity", auth.user?._id, id],
    queryFn: () => client.matches(id),
    enabled: admin && open,
  });
  async function act(work: () => Promise<unknown>) {
    setBusy(true);
    setMessage("");
    try {
      await work();
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["sales-success"] }),
        cache.invalidateQueries({ queryKey: ["sales-identity"] }),
        cache.invalidateQueries({ queryKey: ["sales-agents"] }),
      ]);
      setMessage("Saved and audited.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Identity operation failed");
    } finally {
      setBusy(false);
    }
  }
  if (!admin) return null;
  return (
    <details
      className="space-y-4 rounded-xl border border-border p-4"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer font-semibold">
        Identity review, replay &amp; controlled merging
      </summary>
      <p className="mt-3 text-sm text-muted-foreground">
        Requires fresh dual-channel administrator proof for identity decisions
        and merges. Matching names never establish identity. Keep the linked
        organization record as the canonical target.
      </p>
      {message && <p role="status">{message}</p>}
      {matches.isLoading && (
        <p role="status">Loading verified identity proposals…</p>
      )}
      {matches.error && <Alert>{matches.error.message}</Alert>}
      {!matches.error && matches.data?.items.length === 0 && (
        <p className="text-sm">
          No verified identity proposal recorded. Lifecycle monitoring must be
          enabled to discover eligible matches.
        </p>
      )}
      {!matches.error &&
        matches.data?.items.map((match) => (
          <article
            className="space-y-3 rounded-lg border border-border p-3"
            key={match._id}
          >
            <StatusBadge status={match.status} domain="sales" />
            <p className="break-all text-xs">
              Organization: {match.organizationId}
            </p>
            <p className="text-sm">
              Evidence: {match.evidence.replaceAll("_", " ")}
            </p>
            {match.reviewReason && (
              <p className="text-sm">{match.reviewReason}</p>
            )}
            {!["LINKED", "LINK_REJECTED"].includes(match.status) && (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = new FormData(e.currentTarget);
                  void act(() =>
                    client.review(id, {
                      organizationId: match.organizationId,
                      decision: String(d.get("decision")),
                      reason: String(d.get("reason")),
                      revision,
                    }),
                  );
                }}
              >
                <label className="block text-sm">
                  Identity decision
                  <select name="decision" className={field}>
                    <option value="LINK">
                      Link after verifying organization ownership
                    </option>
                    <option value="REJECT">Reject association</option>
                  </select>
                </label>
                <label className="block text-sm">
                  Identity review reason
                  <textarea
                    name="reason"
                    required
                    minLength={10}
                    maxLength={2000}
                    rows={3}
                    className={field}
                  />
                </label>
                <Button type="submit" variant="outline" disabled={busy}>
                  Record identity decision
                </Button>
              </form>
            )}
          </article>
        ))}
      {organizationId && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            void act(() =>
              client.replay({ organizationId, fromBeginning: true }),
            )
          }
        >
          Replay authoritative lifecycle history
        </Button>
      )}
      <form
        className="space-y-3 border-t border-border pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          const sourceId = String(d.get("sourceId"));
          void act(async () => {
            const source = await successClient.view(sourceId);
            const proposal = await client.proposeMerge({
              sourceId,
              targetId: id,
              sourceRevision: source.customer.revision,
              targetRevision: revision,
              reason: String(d.get("reason")),
            });
            setPreview(proposal);
          });
        }}
      >
        <h3 className="font-semibold">
          Prepare duplicate merge into this customer
        </h3>
        <label className="block text-sm">
          Unlinked source customer ID
          <input
            name="sourceId"
            pattern="[a-fA-F0-9]{24}"
            required
            className={field}
          />
        </label>
        <label className="block text-sm">
          Identity evidence and merge reason
          <textarea
            name="reason"
            required
            minLength={10}
            maxLength={2000}
            rows={3}
            className={field}
          />
        </label>
        <Button type="submit" variant="outline" disabled={busy}>
          Prepare exact merge preview
        </Button>
      </form>
      {preview && (
        <article className="space-y-3 rounded-xl border border-border p-4">
          <h3 className="font-semibold">High-risk identity review</h3>
          <p className="text-sm">
            Merge {preview.source.name} into {preview.target.name}. Original
            records and notes remain. Financial records and the target
            organization identity are preserved. Any opt-out carries forward.
          </p>
          <p className="text-xs">
            Consent: {preview.source.consent} / {preview.target.consent} ·
            expires {new Date(preview.expiresAt).toLocaleString()}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await client.decideMerge(preview.id, {
                    decision: "APPROVE",
                    payloadHash: preview.payloadHash,
                  });
                  setPreview(null);
                })
              }
            >
              Approve reviewed merge
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await client.decideMerge(preview.id, {
                    decision: "REJECT",
                    payloadHash: preview.payloadHash,
                  });
                  setPreview(null);
                })
              }
            >
              Reject merge
            </Button>
          </div>
        </article>
      )}
    </details>
  );
}
