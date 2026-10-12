"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Check,
  Download,
  FileSpreadsheet,
  Save,
  Users,
} from "lucide-react";
import { Alert, Button, Dialog, Input } from "@/components/ui";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { api } from "@/lib/api";
import {
  portfolioOnboardingClient as client,
  type PortfolioProgress,
  type PortfolioStage,
  type ImportPreview,
} from "@/lib/data/portfolio-onboarding";
import {
  downloadBlob,
  downloadPortfolioCsv,
  parseKesMinor,
  portfolioColumns,
  portfolioWorkbook,
  readPortfolioFile,
  moneyColumns,
  type PortfolioRow,
} from "@/lib/data/portfolio-import";
import type { Property } from "@/lib/data/resource-types";

const stages: Array<{ key: PortfolioStage; label: string }> = [
  { key: "PROFILE", label: "Business profile" },
  { key: "PROPERTY", label: "First property" },
  { key: "UNITS", label: "Buildings & units" },
  { key: "PEOPLE", label: "Tenants & caretaker" },
  { key: "DASHBOARD", label: "Your dashboard" },
];
const suggestPropertyCode = (name: string) =>
  name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
const money = (minor: number) =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES" }).format(
    minor / 100,
  );
function rowValues(row: PortfolioRow) {
  return Object.fromEntries(
    portfolioColumns.map(([key]) => [
      key,
      moneyColumns.has(key) && typeof row[key] === "number"
        ? String(Number(row[key]) / 100)
        : String(row[key] ?? ""),
    ]),
  );
}
function RowEditor({
  row,
  index,
  onSave,
  onClose,
}: {
  row: PortfolioRow;
  index: number;
  onSave: (row: PortfolioRow) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState(() => rowValues(row));
  function save(event: FormEvent) {
    event.preventDefault();
    const next: PortfolioRow = {};
    for (const [key, value] of Object.entries(values)) {
      if (!value.trim()) continue;
      if (moneyColumns.has(key)) {
        try {
          next[key] = parseKesMinor(value);
        } catch {
          next[key] = value;
        }
      } else next[key] = key === "floorLevel" ? Number(value) : value;
    }
    onSave(next);
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={"Correct row " + (index + 1)}
      description="Amounts are KES. Saved contacts will require their own verification."
      className="max-w-4xl"
    >
      <form onSubmit={save}>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {portfolioColumns.map(([key, label], position) => (
            <label key={key} className="text-sm">
              {label}
              <Input
                autoFocus={position === 0}
                value={values[key]}
                onChange={(event) =>
                  setValues({ ...values, [key]: event.target.value })
                }
                className="mt-2"
              />
            </label>
          ))}
        </div>
        <Button className="mt-6" type="submit">
          Save corrections and validate again
        </Button>
      </form>
    </Dialog>
  );
}
function localDuplicates(rows: PortfolioRow[]) {
  const units = new Set<string>(),
    phones = new Set<string>(),
    emails = new Set<string>(),
    errors: Array<{ row: number; message: string }> = [];
  rows.forEach((row, index) => {
    const key = [row.propertyCode, row.buildingCode ?? "SITE", row.unitCode]
      .map((value) =>
        String(value ?? "")
          .trim()
          .toUpperCase(),
      )
      .join("/");
    if (units.has(key))
      errors.push({ row: index + 1, message: "Duplicate unit in this file" });
    units.add(key);
    if (row.tenantPhone) {
      const phone = String(row.tenantPhone).replace(/[\s()-]/g, "");
      if (phones.has(phone))
        errors.push({
          row: index + 1,
          message: "Duplicate tenant phone in this file",
        });
      phones.add(phone);
    }
    if (row.tenantEmail) {
      const email = String(row.tenantEmail).toLowerCase();
      if (emails.has(email))
        errors.push({
          row: index + 1,
          message: "Duplicate tenant email in this file",
        });
      emails.add(email);
    }
  });
  return errors;
}
function Workspace({
  org,
  progress,
}: {
  org: string;
  progress: PortfolioProgress;
}) {
  const { user } = useAuth();
  const qc = useQueryClient(),
    key = ["portfolio-onboarding", org, user?._id];
  const [stage, setStage] = useState<PortfolioStage>(() => {
    const requested =
      typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get("step");
    return stages.some((item) => item.key === requested)
      ? (requested as PortfolioStage)
      : (progress.lastStage ?? progress.nextStage);
  });
  const [property, setProperty] = useState(
    progress.draft?.property ?? {
      name: "",
      code: "",
      address: "",
      city: "Nairobi",
      propertyType: "APARTMENT",
    },
  );
  const [rows, setRows] = useState<PortfolioRow[]>(
      progress.draft?.importRows ?? [],
    ),
    [mapping, setMapping] = useState<string[]>([]);
  const [previews, setPreviews] = useState<
      Array<{ offset: number; preview: ImportPreview }>
    >([]),
    [importErrors, setImportErrors] = useState<
      Array<{ row: number; message: string }>
    >([]);
  const [page, setPage] = useState(0),
    [editing, setEditing] = useState<number | null>(null),
    [confirmed, setConfirmed] = useState(0);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [propertyId, setPropertyId] = useState(progress.properties[0]?._id ?? "");
  const [invite, setInvite] = useState({ email: "", phone: "" }),
    [inviteLink, setInviteLink] = useState("");
  const refresh = async () => {
    const saved = await client.progress(org);
    qc.setQueryData(key, saved);
    return saved;
  };
  async function saveDraft() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await client.saveDraft(org, {
        expectedRevision: progress.revision,
        stage,
        property,
        importRows: rows.slice(0, 500),
      });
      qc.setQueryData(key, saved);
      setNotice(
        rows.length > 500
          ? "Setup saved. Re-upload the same file to resume larger imports; confirmed batches are retained."
          : "Setup saved. You can leave and return later.",
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }
  async function createProperty(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const created = await api<Property>(
        "/organizations/" + org + "/properties",
        {
          method: "POST",
          body: JSON.stringify({
            name: property.name,
            code: property.code.toUpperCase(),
            propertyType: property.propertyType,
            address: {
              addressLine1: property.address,
              city: property.city,
              country: "Kenya",
            },
          }),
        },
      );
      setPropertyId(created._id);
      await refresh();
      setStage("UNITS");
      setNotice(
        "Property saved. Add buildings and units manually or import your portfolio.",
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Property could not be saved.",
      );
      await refresh().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }
  async function loadFile(file: File) {
    setBusy(true);
    setError("");
    setNotice("");
    setRows([]);
    setPreviews([]);
    setImportErrors([]);
    setConfirmed(0);
    setPage(0);
    try {
      const parsed = await readPortfolioFile(file);
      setRows(parsed.rows);
      setMapping(parsed.mapping.map((item) => item.title + " → " + item.key));
      setNotice("File loaded. Validate every batch before confirming.");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The file could not be read.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function validate() {
    if (!rows.length || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    setPreviews([]);
    setImportErrors([]);
    try {
      const duplicates = localDuplicates(rows),
        results: Array<{ offset: number; preview: ImportPreview }> = [],
        errors = [...duplicates];
      for (let offset = 0; offset < rows.length; offset += 500) {
        const preview = await client.preview(
          org,
          rows.slice(offset, offset + 500),
        );
        results.push({ offset, preview });
        errors.push(
          ...preview.errors.map((item) => ({
            ...item,
            row: item.row + offset,
          })),
        );
      }
      setPreviews(results);
      setImportErrors(errors);
      setNotice(
        errors.length
          ? "Correct the flagged rows, then validate again."
          : "Every batch validated. Review the rows and confirm the import.",
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Validation failed. Your rows are preserved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!previews.length || importErrors.length || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    setConfirmed(0);
    let done = 0;
    try {
      for (const item of previews) {
        // Re-preview against records created by previous batches and concurrent owner actions.
        const current = await client.preview(
          org,
          rows.slice(item.offset, item.offset + 500),
        );
        if (!current.valid) {
          setImportErrors(
            current.errors.map((value) => ({
              ...value,
              row: value.row + item.offset,
            })),
          );
          throw new Error(
            "A batch changed. Correct the errors or validate again. Confirmed batches remain saved.",
          );
        }
        const receipt = await client.confirm(org, current);
        done += receipt.units;
        setConfirmed(done);
      }
      await refresh();
      setNotice(
        "Import complete: " +
          done +
          " units confirmed. Contacts remain unverified until their own OTP succeeds.",
      );
      setRows([]);
      setPreviews([]);
      setImportErrors([]);
      setStage("PEOPLE");
    } catch (failure) {
      setError(
        (failure instanceof Error ? failure.message : "Import interrupted.") +
          " " +
          done +
          " units are confirmed. Re-upload the same file to resume safely.",
      );
      await refresh().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }
  async function inviteCaretaker(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setInviteLink("");
    try {
      const result = await api<{ token: string }>(
        "/organizations/" + org + "/invitations",
        {
          method: "POST",
          body: JSON.stringify({
            email: invite.email,
            phone: invite.phone,
            role: "CARETAKER",
            propertyIds: [propertyId],
            buildingIds: [],
            unitIds: [],
            expiresInDays: 7,
          }),
        },
      );
      setInviteLink(
        window.location.origin + "/invite/" + encodeURIComponent(result.token),
      );
      await refresh();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Invitation could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-accent-foreground">
            Welcome to Dapinni
          </p>
          <h1 className="mt-2 text-3xl font-semibold">
            Your workspace is ready. Let’s set up your portfolio.
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {progress.name} · Complete the essentials, then add optional details
            at your own pace.
          </p>
        </div>
        <Button
          variant="outline"
          loading={busy}
          onClick={() => void saveDraft()}
        >
          <Save size={15} />
          Save and return later
        </Button>
      </header>
      <nav
        aria-label="Property onboarding steps"
        className="grid grid-cols-2 gap-2 sm:grid-cols-5"
      >
        {stages.map((item, index) => (
          <button
            key={item.key}
            type="button"
            disabled={busy}
            aria-current={stage === item.key ? "step" : undefined}
            onClick={() => setStage(item.key)}
            className={
              "rounded-xl border p-3 text-left text-sm " +
              (stage === item.key
                ? "border-primary bg-primary/10 font-semibold"
                : "border-border bg-card")
            }
          >
            <span className="mb-1 block text-xs text-muted-foreground">
              Step {index + 1}
              {item.key === "PEOPLE" ? " · optional" : ""}
            </span>
            {item.label}
          </button>
        ))}
      </nav>
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex justify-between gap-4 text-sm">
          <span>Essential setup based on saved records</span>
          <strong>{progress.percent}%</strong>
        </div>
        <div className="mt-3 h-2 rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: progress.percent + "%" }}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {progress.facts.properties} properties · {progress.facts.units} units
          · {progress.facts.tenants} tenants · {progress.facts.staff} active
          staff
        </p>
      </section>
      {error && <Alert tone="destructive">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-8">
        {stage === "PROFILE" && (
          <div>
            <Building2 size={26} />
            <h2 className="mt-3 text-xl font-semibold">
              Your business profile is already saved
            </h2>
            <dl className="mt-5 grid gap-5 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Business</dt>
                <dd className="mt-1 font-medium">
                  {progress.business.legalName}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Billing email</dt>
                <dd className="mt-1 break-all">
                  {progress.business.billingEmail ?? "See billing"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  Operating tier
                </dt>
                <dd className="mt-1">
                  {progress.business.planKey?.replaceAll("_", " ") ??
                    "Active plan"}
                </dd>
              </div>
            </dl>
            <p className="mt-5 text-sm text-muted-foreground">
              Your signed agreement and verified subscription remain separate
              from property setup. You do not need to enter those details again.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={() => setStage("PROPERTY")}>
                Continue to your property
              </Button>
              <Link className="btn-secondary" href="/onboarding?review=1">
                Review agreement and invoice
              </Link>
            </div>
          </div>
        )}
        {stage === "PROPERTY" && (
          <div>
            <h2 className="text-xl font-semibold">
              {progress.facts.properties
                ? "Your saved properties"
                : "Add your first property"}
            </h2>
            {progress.properties.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {progress.properties.slice(0, 10).map((item) => (
                  <Link
                    key={item._id}
                    href={"/properties/" + item._id}
                    className="btn-secondary"
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            )}
            <p className="mt-3 text-sm text-muted-foreground">
              Enter only the basic property details, or import properties and
              units together.
            </p>
            <form
              onSubmit={(event) => void createProperty(event)}
              className="mt-5 grid gap-5 sm:grid-cols-2"
            >
              <label className="text-sm">
                Property name
                <Input
                  required
                  value={property.name}
                  onChange={(event) => {
                    const name = event.target.value;
                    setProperty((previous) => ({
                      ...previous,
                      name,
                      code:
                        !previous.code ||
                        previous.code === suggestPropertyCode(previous.name)
                          ? suggestPropertyCode(name)
                          : previous.code,
                    }));
                  }}
                  className="mt-2"
                />
              </label>
              <label className="text-sm">
                Property code
                <Input
                  required
                  pattern="[A-Za-z0-9][A-Za-z0-9_-]*"
                  value={property.code}
                  onChange={(event) =>
                    setProperty({ ...property, code: event.target.value })
                  }
                  className="mt-2"
                />
              </label>
              <label className="text-sm">
                Location / address
                <Input
                  required
                  value={property.address}
                  onChange={(event) =>
                    setProperty({ ...property, address: event.target.value })
                  }
                  className="mt-2"
                />
              </label>
              <label className="text-sm">
                City / town
                <Input
                  required
                  value={property.city}
                  onChange={(event) =>
                    setProperty({ ...property, city: event.target.value })
                  }
                  className="mt-2"
                />
              </label>
              <label className="text-sm">
                Property category
                <select
                  className="input mt-2 block w-full"
                  value={property.propertyType}
                  onChange={(event) =>
                    setProperty({
                      ...property,
                      propertyType: event.target.value,
                    })
                  }
                >
                  {[
                    "APARTMENT",
                    "RESIDENTIAL_ESTATE",
                    "COMMERCIAL",
                    "MIXED_USE",
                    "OFFICE",
                    "RETAIL",
                    "WAREHOUSE",
                    "OTHER",
                  ].map((value) => (
                    <option key={value} value={value}>
                      {value.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap items-end gap-3">
                <Button loading={busy} type="submit">
                  Save property
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStage("UNITS")}
                >
                  Import instead
                </Button>
              </div>
            </form>
          </div>
        )}
        {stage === "UNITS" && (
          <div>
            <h2 className="text-xl font-semibold">
              Add buildings, floors and units
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Use manual setup for a small property or import up to 5,000 units
              per file. Each batch of 500 commits together. The same file can
              safely resume confirmed batches.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              {progress.properties[0] && (
                <Link
                  className="btn-secondary"
                  href={"/properties/" + progress.properties[0]._id}
                >
                  Add buildings and units manually
                </Link>
              )}
              {!progress.properties.length && (
                <Link className="btn-secondary" href="/properties/setup">
                  Create a property and units together
                </Link>
              )}
              <Button
                variant="outline"
                loading={busy}
                onClick={() => {
                  setBusy(true);
                  setError("");
                  void portfolioWorkbook()
                    .then((buffer) =>
                      downloadBlob(
                        new Blob([buffer], {
                          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        }),
                        "dapinni-portfolio-template.xlsx",
                      ),
                    )
                    .catch((failure) => setError(failure.message))
                    .finally(() => setBusy(false));
                }}
              >
                <Download size={15} />
                Download Excel template
              </Button>
              <Button variant="outline" onClick={downloadPortfolioCsv}>
                <Download size={15} />
                Download CSV template
              </Button>
            </div>
            <label className="mt-6 block rounded-xl border-2 border-dashed border-border p-5 text-sm font-medium">
              <FileSpreadsheet className="mb-3" size={24} />
              Upload your .xlsx or .csv file
              <input
                aria-label="Portfolio import file"
                className="mt-3 block w-full text-sm"
                type="file"
                accept=".xlsx,.csv"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void loadFile(file);
                }}
              />
            </label>
            {mapping.length > 0 && (
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer">
                  Automatic column mapping ({mapping.length} columns)
                </summary>
                <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                  {mapping.map((item) => (
                    <li key={item} className="text-xs text-muted-foreground">
                      {item}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {rows.length > 0 && (
              <div className="mt-6 space-y-4">
                <p className="text-sm font-semibold">
                  {rows.length} rows loaded · {previews.length} batches
                  previewed
                </p>
                <div className="max-w-full overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted">
                      <tr>
                        {[
                          "Row",
                          "Property",
                          "Building",
                          "Unit",
                          "Monthly rent",
                          "Tenant",
                          "Action",
                        ].map((label) => (
                          <th key={label} className="whitespace-nowrap p-3">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows
                        .slice(page * 25, page * 25 + 25)
                        .map((row, index) => (
                          <tr
                            key={page * 25 + index}
                            className="border-t border-border"
                          >
                            <td className="p-3">{page * 25 + index + 1}</td>
                            <td className="p-3">
                              {String(row.propertyName ?? "")}
                            </td>
                            <td className="p-3">
                              {String(row.buildingName ?? "Site")}
                            </td>
                            <td className="p-3">
                              {String(row.unitCode ?? "")}
                            </td>
                            <td className="whitespace-nowrap p-3">
                              {typeof row.monthlyRentMinor === "number"
                                ? money(row.monthlyRentMinor)
                                : String(row.monthlyRentMinor ?? "Missing")}
                            </td>
                            <td className="p-3">
                              {String(row.tenantFirstName ?? "—")}
                            </td>
                            <td className="p-3">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => setEditing(page * 25 + index)}
                              >
                                Correct row
                              </Button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0 || busy}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous rows
                  </Button>
                  <span className="text-xs">
                    Page {page + 1} of {Math.ceil(rows.length / 25)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(page + 1) * 25 >= rows.length || busy}
                    onClick={() => setPage(page + 1)}
                  >
                    Next rows
                  </Button>
                </div>
                {importErrors.length > 0 && (
                  <div
                    role="alert"
                    className="rounded-lg border border-destructive/40 p-4"
                  >
                    <h3 className="font-semibold">
                      {importErrors.length} validation issues
                    </h3>
                    <ul className="mt-3 space-y-2">
                      {importErrors.slice(0, 25).map((item, index) => (
                        <li key={index} className="text-sm">
                          Row {item.row}: {item.message}{" "}
                          <button
                            type="button"
                            className="underline"
                            onClick={() => setEditing(item.row - 1)}
                          >
                            Correct
                          </button>
                        </li>
                      ))}
                    </ul>
                    {importErrors.length > 25 && (
                      <p className="mt-3 text-xs">
                        Correct these issues and validate again to see remaining
                        errors.
                      </p>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-3">
                  <Button loading={busy} onClick={() => void validate()}>
                    Validate all rows
                  </Button>
                  <Button
                    variant="secondary"
                    loading={busy}
                    disabled={
                      !previews.length ||
                      importErrors.length > 0 ||
                      !previews.every((item) => item.preview.valid)
                    }
                    onClick={() => void confirm()}
                  >
                    Confirm import
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Confirm only current tenancies and opening balances you have
                  checked. This creates no provider payment and marks no contact
                  verified.
                </p>
              </div>
            )}
            {busy && (
              <p className="mt-4 text-sm" role="status">
                Processing…{" "}
                {confirmed > 0 ? confirmed + " units confirmed." : ""}
              </p>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setStage("PEOPLE")}
              >
                Continue to people (optional)
              </Button>
              <Link className="btn-secondary" href="/dashboard">
                Add the rest later
              </Link>
            </div>
          </div>
        )}
        {stage === "PEOPLE" && (
          <div>
            <Users size={26} />
            <h2 className="mt-3 text-xl font-semibold">
              Invite a caretaker and add tenants when you’re ready
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Imported contacts are unverified. Each person proves ownership by
              email OTP. Tenant onboarding keeps the unit you assign.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/tenants" className="btn-secondary">
                Register or activate tenants
              </Link>
              <Link href="/admin" className="btn-secondary">
                Manage team access
              </Link>
            </div>
            {progress.properties.length > 0 && (
              <form
                onSubmit={(event) => void inviteCaretaker(event)}
                className="mt-6 grid gap-4 rounded-xl border border-border p-5 sm:grid-cols-2"
              >
                <h3 className="font-semibold sm:col-span-2">
                  Create a scoped caretaker invitation
                </h3>
                <label className="text-sm">
                  Caretaker email
                  <Input
                    required
                    type="email"
                    value={invite.email}
                    onChange={(event) =>
                      setInvite({ ...invite, email: event.target.value })
                    }
                    className="mt-2"
                  />
                </label>
                <label className="text-sm">
                  Caretaker phone
                  <Input
                    required
                    type="tel"
                    value={invite.phone}
                    onChange={(event) =>
                      setInvite({ ...invite, phone: event.target.value })
                    }
                    className="mt-2"
                  />
                </label>
                <label className="text-sm">
                  Assigned property
                  <select
                    required
                    className="input mt-2 block w-full"
                    value={propertyId}
                    onChange={(event) => setPropertyId(event.target.value)}
                  >
                    <option value="">Choose a property</option>
                    {progress.properties.map((item) => (
                      <option key={item._id} value={item._id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="self-end">
                  <Button type="submit" loading={busy}>
                    Create invitation
                  </Button>
                </div>
              </form>
            )}
            {inviteLink && (
              <Alert tone="success" className="mt-5">
                Invitation created. Share this private link with the intended
                caretaker.
                <Input
                  aria-label="Private caretaker invitation link"
                  readOnly
                  value={inviteLink}
                  className="mt-3"
                  onFocus={(event) => event.target.select()}
                />
              </Alert>
            )}
            <Button className="mt-6" onClick={() => setStage("DASHBOARD")}>
              Continue to dashboard
            </Button>
          </div>
        )}
        {stage === "DASHBOARD" && (
          <div>
            <Check size={28} />
            <h2 className="mt-3 text-2xl font-semibold">
              See your real portfolio
            </h2>
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ["Properties", progress.facts.properties],
                ["Units", progress.facts.units],
                ["Occupied", progress.facts.occupied],
                ["Vacant", progress.facts.vacant],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-muted p-4">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-2 text-2xl font-semibold">{value}</p>
                </div>
              ))}
            </div>
            <p className="mt-5 text-sm">
              {progress.facts.knownMonthlyRentMinor === null
                ? "Expected rent is unavailable until current tenancy rents are saved."
                : "Known monthly tenancy rent: " +
                  money(progress.facts.knownMonthlyRentMinor) +
                  (progress.facts.rentCoverageComplete
                    ? ""
                    : ". Some occupied units still need tenancy records.")}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Collections, arrears and forecasts appear only when their
              underlying records and history are available. Optional setup does
              not block your workspace.
            </p>
            <ul className="mt-5 space-y-2 text-sm">
              {progress.checks
                .filter((item) => !item.done)
                .map((item) => (
                  <li key={item.key}>
                    <Link href={item.href} className="underline">
                      {item.label}
                    </Link>
                  </li>
                ))}
            </ul>
            <Link href="/dashboard" className="btn-primary mt-6 inline-flex">
              Open your real dashboard
            </Link>
          </div>
        )}
      </section>
      {editing !== null && rows[editing] && (
        <RowEditor
          key={editing}
          row={rows[editing]}
          index={editing}
          onClose={() => setEditing(null)}
          onSave={(changed) => {
            setRows((previous) =>
              previous.map((row, index) => (index === editing ? changed : row)),
            );
            setEditing(null);
            setPreviews([]);
            setImportErrors([]);
          }}
        />
      )}
    </div>
  );
}
export default function GetStartedPage() {
  const { activeOrganizationId: org } = useOrganization();
  const { user, memberships, isDevMode } = useAuth();
  const member = memberships.find((item) => item.organizationId === org),
    allowed =
      !!member?.roles.includes("LANDLORD") &&
      member.scope.allProperties &&
      !isDevMode;
  const progress = useQuery({
    queryKey: ["portfolio-onboarding", org, user?._id],
    queryFn: () => client.progress(org!),
    enabled: !!org && allowed,
    retry: false,
  });
  if (!allowed)
    return (
      <Alert>
        This guided setup is available to the organization owner. Use your
        assigned workspace for other roles.
      </Alert>
    );
  if (!org) return <Alert>Select your owner workspace to continue.</Alert>;
  if (progress.isLoading)
    return (
      <p role="status" className="p-8">
        Restoring your saved setup and portfolio records…
      </p>
    );
  if (progress.error || !progress.data)
    return (
      <div className="space-y-4">
        <Alert tone="destructive">
          {progress.error?.message ?? "Setup unavailable."}
        </Alert>
        <Button onClick={() => void progress.refetch()}>Retry</Button>
        <Link className="btn-secondary" href="/onboarding">
          Review verification, agreement and payment
        </Link>
      </div>
    );
  return <Workspace key={org} org={org} progress={progress.data} />;
}
