"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Download,
  Upload,
  RefreshCw,
} from "lucide-react";
import { Alert, Button, Input } from "@/components/ui";
import { useOrganization } from "@/hooks/use-organization";
import {
  salesDemoClient as client,
  kes,
  type ImportPreview,
} from "@/lib/data/sales-demo";
import { parsePilotCsv, pilotCsvTemplate } from "@/lib/data/pilot-import";
export function GuidedPilotWorkspace() {
  const { activeOrganizationId, setActiveOrganization } = useOrganization(),
    [requested, setRequested] = useState(""),
    [rows, setRows] = useState<Record<string, unknown>[]>([]),
    [preview, setPreview] = useState<ImportPreview | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [staffEmail, setStaffEmail] = useState(""),
    [staffRole, setStaffRole] = useState("CARETAKER"),
    [invitationLink, setInvitationLink] = useState(""),
    [staffProperty, setStaffProperty] = useState("");
  useEffect(() => {
    setRequested(
      new URLSearchParams(window.location.search).get("organizationId") ?? "",
    );
  }, []);
  const org = requested || activeOrganizationId || "";
  const progress = useQuery({
    queryKey: ["guided-pilot", org],
    queryFn: () => client.progress(org),
    enabled: !!org,
  });
  useEffect(() => {
    if (requested && progress.data) setActiveOrganization(requested);
  }, [requested, progress.data, setActiveOrganization]);
  useEffect(() => {
    setRows([]);
    setPreview(null);
    setError("");
    setNotice("");
    setStaffEmail("");
    setInvitationLink("");
  }, [org]);
  function download() {
    const blob = new Blob([pilotCsvTemplate], {
        type: "text/csv;charset=utf-8",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "property-command-center-pilot-import.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  const p = progress.data;
  if (!org)
    return (
      <section className="card p-8">
        <h1 className="text-2xl font-semibold">Prepare your guided pilot</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Ask your sales contact to prepare your verified owner workspace, then
          select that organization.
        </p>
      </section>
    );
  if (progress.isLoading)
    return (
      <p role="status">
        Loading your saved workspace and actual pilot activity…
      </p>
    );
  if (!p)
    return (
      <Alert tone="destructive">
        {progress.error?.message ??
          "A guided pilot is not configured for this organization."}
        <Button variant="link" onClick={() => void progress.refetch()}>
          Retry
        </Button>
        <Link href="/onboarding" className="ml-3 underline">
          Commercial onboarding
        </Link>
      </Alert>
    );
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider">
            Guided pilot · your operation
          </p>
          <h1 className="mt-2 text-3xl font-semibold">{p.organizationName}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {p.durationDays}-day guided pilot · {p.plan.replaceAll("_", " ")} ·
            expires {new Date(p.expiresAt).toLocaleDateString("en-KE")}
          </p>
        </div>
        <Button
          variant="outline"
          loading={progress.isFetching}
          onClick={() => void progress.refetch()}
        >
          <RefreshCw size={15} />
          Refresh progress
        </Button>
      </header>
      {p.expired && (
        <Alert>
          Your pilot period has ended. Existing records remain available. Review
          your agreement and activation invoice to continue.
        </Alert>
      )}
      {error && <Alert tone="destructive">{error}</Alert>}
      <p role="status" aria-live="polite" className="text-sm">
        {notice}
      </p>
      <section className="rounded-2xl border border-primary/40 bg-primary/5 p-6">
        <h2 className="text-xs font-bold uppercase tracking-wider">
          Your Command Center is
        </h2>
        <strong className="mt-2 block text-5xl font-semibold">
          {p.readiness.percent}% ready
        </strong>
        <div
          className="mt-5 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={p.readiness.percent}
          aria-label="Command Center activation readiness"
        >
          <div
            className="h-full bg-primary transition-[width] motion-reduce:transition-none"
            style={{ width: `${p.readiness.percent}%` }}
          />
        </div>
        <p className="mt-4 text-sm">
          {p.readiness.complete
            ? "Activation milestone reached: your operation is configured and a core workflow is completed."
            : `Next: ${p.readiness.next?.label ?? "Review your setup"}`}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Operational readiness is measured from your real records. Paid access
          still requires the signed agreement and verified prepaid payment.
        </p>
      </section>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold">
            Get to your first useful outcome
          </h2>
          <ol className="mt-5 space-y-3">
            {p.readiness.checks.map((check) => (
              <li
                className="flex items-center justify-between gap-3 rounded-xl border border-border p-4"
                key={check.key}
              >
                <div className="flex items-center gap-3">
                  {check.done ? (
                    <CheckCircle2 className="text-emerald-600" size={18} />
                  ) : (
                    <Circle className="text-muted-foreground" size={18} />
                  )}
                  <div>
                    <strong className="text-sm">{check.label}</strong>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {check.done
                        ? "Complete · confirmed by platform records"
                        : "Next action required"}
                    </span>
                  </div>
                </div>
                {!check.done && (
                  <Link href={check.href} className="btn-secondary">
                    Continue <ArrowRight size={14} />
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </section>
        <aside className="space-y-5">
          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">
              Your first meaningful insight
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Once the rent ledger is populated, open the Command Center to
              identify the biggest arrears, repair or vacancy exposure.
              Investigate one item and complete an action.
            </p>
            {p.insight && (
              <div className="mt-4 rounded-xl bg-muted p-4">
                <p className="text-sm font-semibold">{p.insight.title}</p>
                <strong className="mt-2 block text-2xl">
                  {kes(p.insight.amountMinor)}
                </strong>
                <Button
                  className="mt-3"
                  disabled={busy || p.expired}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await client.reviewInsight(org, p.insight!);
                      window.location.assign(p.insight!.href);
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Unable to investigate insight",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Investigate this exposure <ArrowRight size={15} />
                </Button>
              </div>
            )}
            <Link href="/dashboard" className="btn-primary mt-5 inline-flex">
              Open my Command Center <ArrowRight size={15} />
            </Link>
            <Link
              href="/maintenance"
              className="btn-secondary mt-3 inline-flex"
            >
              Run a maintenance workflow
            </Link>
          </section>
          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">Commercial activation</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Current stage: {p.commercialState.replaceAll("_", " ")}.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Review the plan and exact unit pricing, sign the services
              agreement, then pay the prepaid invoice. A checkout redirect never
              activates access.
            </p>
            <Link href="/onboarding" className="btn-primary mt-5 inline-flex">
              Review agreement and activation <ArrowRight size={15} />
            </Link>
          </section>
        </aside>
      </div>
      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-xl font-semibold">Load the portfolio together</h2>
        <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
          Import new properties, buildings, floors, units, tenants, tenancies,
          rents, deposits and confirmed opening balances. Up to 500 units per
          batch. Amounts are KES cents: KES 25,000 = 2500000. No payment, tenant
          message or invoice is created by this import.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Existing property additions and existing tenant accounts use
          controlled onboarding. Preview errors must be corrected before
          confirmation.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={download}>
            <Download size={15} />
            Download import template
          </Button>
          <label className="btn-secondary cursor-pointer">
            <Upload size={15} />
            Choose CSV
            <input
              aria-label="Upload portfolio CSV"
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              disabled={p.expired || busy}
              onChange={async (e) => {
                setPreview(null);
                setRows([]);
                setError("");
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const parsed = parsePilotCsv(await file.text());
                  setRows(parsed);
                  setNotice(
                    `${parsed.length} rows loaded. Validate and preview before importing.`,
                  );
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Unable to read CSV",
                  );
                }
              }}
            />
          </label>
          <Button
            disabled={!rows.length || busy || p.expired}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                setPreview(await client.preview(org, rows));
              } catch (e) {
                setError(e instanceof Error ? e.message : "Validation failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Validate and preview
          </Button>
        </div>
        {preview && (
          <div className="mt-6 space-y-4">
            <p className="text-sm font-semibold">
              {preview.summary.properties} properties ·{" "}
              {preview.summary.buildings} buildings · {preview.summary.units}{" "}
              units · {preview.summary.tenancies} tenancies · opening balance{" "}
              {kes(preview.summary.openingBalanceMinor)}
            </p>
            {preview.errors.length > 0 ? (
              <Alert tone="destructive">
                <p>Correct these errors and upload again:</p>
                <ul className="mt-3 space-y-2">
                  {preview.errors.slice(0, 50).map((e, i) => (
                    <li key={i}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
                {preview.errors.length > 50 && (
                  <p>
                    {preview.errors.length - 50} more errors; correct the file
                    before importing.
                  </p>
                )}
              </Alert>
            ) : (
              <p className="text-sm">
                All rows passed validation. Confirm only after reviewing the
                preview and opening balances.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <caption className="sr-only">
                  First twenty validated import rows
                </caption>
                <thead>
                  <tr className="border-b border-border">
                    <th className="p-3">Property / building</th>
                    <th className="p-3">Floor / unit</th>
                    <th className="p-3">Tenant</th>
                    <th className="p-3">Rent</th>
                    <th className="p-3">Opening balance</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 20).map((r, i) => (
                    <tr className="border-b border-border" key={i}>
                      <td className="p-3">
                        {String(r.propertyName)} / {String(r.buildingName)}
                      </td>
                      <td className="p-3">
                        {String(r.floorName)} / {String(r.unitCode)}
                      </td>
                      <td className="p-3">
                        {r.tenantFirstName
                          ? `${r.tenantFirstName} ${r.tenantLastName}`
                          : "Vacant"}
                      </td>
                      <td className="p-3">{kes(Number(r.monthlyRentMinor))}</td>
                      <td className="p-3">
                        {kes(Number(r.openingBalanceMinor))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              loading={busy}
              disabled={!preview.valid || p.expired}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const result = await client.confirm(org, preview);
                  setNotice(
                    `${result.units} units imported. Portfolio, tenancies and opening ledger are saved together.`,
                  );
                  setRows([]);
                  setPreview(null);
                  await progress.refetch();
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Import failed; refresh preview before retrying",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Confirm and import {preview.summary.units} units
            </Button>
          </div>
        )}
      </section>
      <section
        id="staff"
        className="rounded-2xl border border-border bg-card p-6"
      >
        <h2 className="text-xl font-semibold">
          Assign people to the operation
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Create a scoped invitation using existing access controls. Share the
          invitation link with the staff member; no email is sent here.
        </p>
        <form
          className="mt-5 flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const result = await client.inviteStaff(
                org,
                staffEmail,
                staffRole,
                staffProperty || p.properties[0]!.id,
              );
              setInvitationLink(
                `${window.location.origin}/invite/${result.token}`,
              );
              setNotice(
                "Staff invitation prepared. Share the private invitation link directly.",
              );
              await progress.refetch();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Invitation failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="text-sm">
            Staff email
            <Input
              type="email"
              required
              className="mt-2"
              value={staffEmail}
              onChange={(e) => setStaffEmail(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Role
            <select
              className="mt-2 block rounded-lg border border-border bg-background px-3 py-2"
              value={staffRole}
              onChange={(e) => setStaffRole(e.target.value)}
            >
              <option value="CARETAKER">Caretaker</option>
              <option value="PROPERTY_MANAGER">Property manager</option>
              <option value="CONTRACTOR">Contractor</option>
            </select>
          </label>
          <label className="text-sm">
            Assigned property
            <select
              className="mt-2 block rounded-lg border border-border bg-background px-3 py-2"
              required
              value={staffProperty || p.properties[0]?.id || ""}
              onChange={(e) => setStaffProperty(e.target.value)}
            >
              {!p.properties.length && (
                <option value="">Load a property first</option>
              )}
              {p.properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="submit"
            loading={busy}
            disabled={p.expired || !p.properties.length}
          >
            Prepare staff invitation
          </Button>
        </form>
        {invitationLink && (
          <p className="mt-4 break-all text-sm">
            <strong>Private invitation: </strong>
            <a className="underline" href={invitationLink}>
              {invitationLink}
            </a>
          </p>
        )}
      </section>
      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-xl font-semibold">During your pilot</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Actual platform activity. No fabricated ROI or claimed savings.
        </p>
        <dl className="mt-5 grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Object.entries(p.value).map(([key, value]) => (
            <div className="rounded-xl bg-muted p-4" key={key}>
              <dt className="text-xs text-muted-foreground">
                {key
                  .replace(/([A-Z])/g, " $1")
                  .replace(/^./, (v) => v.toUpperCase())}
              </dt>
              <dd className="mt-2 text-3xl font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
