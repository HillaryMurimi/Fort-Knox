"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  History,
  ShieldCheck,
  RotateCcw,
  Wrench,
  CircleDollarSign,
  Target,
  Users,
} from "lucide-react";
import { Button, Input, Alert } from "@/components/ui";
import { useAuth } from "@/hooks/use-auth";
import { salesDemoClient as client, kes } from "@/lib/data/sales-demo";
import type {
  DemoAction,
  DemoProfile,
  DemoSessionView,
  DemoStory,
  DemoMaintenance,
} from "@/lib/data/sales-demo.types";
import { DemoStatus } from "./demo-status";
const fieldClass =
  "mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const optionalFields: [keyof DemoProfile, string][] = [
  ["contactName", "Contact name"],
  ["propertyType", "Property type"],
  ["managementMethod", "Existing management method"],
  ["existingSoftware", "Existing software"],
  ["spreadsheetUsage", "Spreadsheet usage"],
  ["whatsAppDependency", "WhatsApp dependency"],
  ["paymentProcess", "Payment / reconciliation process"],
  ["maintenanceProcess", "Maintenance process"],
  ["staffStructure", "Staff structure"],
  ["securityInfrastructure", "CCTV / security infrastructure"],
  ["financialProblem", "Biggest financial problem"],
  ["operationalProblem", "Biggest operational problem"],
  ["managementFrustration", "Biggest management frustration"],
  ["securityConcern", "Biggest security concern"],
  ["objective", "Selected demonstration objective"],
];
function Pane({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-7">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}
export function SalesDemoController() {
  const auth = useAuth(),
    [leadId, setLeadId] = useState<string | undefined>(undefined),
    [profile, setProfile] = useState<DemoProfile>({
      companyName: "",
      primaryPain: "RENT",
      plan: "CONTROL",
      template: "CONTROL_150",
    }),
    [demo, setDemo] = useState<DemoSessionView | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [pane, setPane] = useState<DemoStory>("RENT"),
    [selected, setSelected] = useState(""),
    [artifact, setArtifact] = useState(""),
    [pilotForm, setPilotForm] = useState(false),
    [ownerEmail, setOwnerEmail] = useState(""),
    [pilotName, setPilotName] = useState(""),
    [page, setPage] = useState(1);
  const allowed =
    auth.roles.includes("SUPER_ADMIN") ||
    auth.memberships.some((m) => m.permissions.includes("sales.demo.manage"));
  const catalog = useQuery({
    queryKey: ["sales-demo-catalog"],
    queryFn: client.catalog,
    enabled: allowed && !auth.isDevMode,
  });
  const sessions = useQuery({
    queryKey: ["sales-demos", page],
    queryFn: () => client.list(page),
    enabled: allowed && !auth.isDevMode,
  });
  function accept(value: DemoSessionView) {
    setDemo(value);
    setLeadId(value.leadId);
    setProfile(value.profile);
    setPane(value.profile.primaryPain);
    window.history.replaceState(null, "", `/sales-demo?session=${value.id}`);
  }
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("session");
    if (id && allowed && !auth.isDevMode) {
      client
        .get(id)
        .then(accept)
        .catch((e) =>
          setError(
            e instanceof Error ? e.message : "Unable to restore demonstration",
          ),
        );
    }
  }, [allowed, auth.isDevMode]);
  async function run(
    action: DemoAction | { kind: "RESET" },
    nextPane?: DemoStory,
  ) {
    if (!demo) return null;
    setBusy(true);
    setError("");
    try {
      const value = await client.command(demo, action);
      setDemo(value);
      setNotice(
        action.kind === "RESET"
          ? "Demo restored to its deterministic starting state."
          : (value.snapshot.history.at(-1)?.outcome ?? "State updated"),
      );
      if (nextPane) setPane(nextPane);
      return value;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed. Retry.");
      try {
        setDemo(await client.get(demo.id));
      } catch {
        /* Original failure remains visible. */
      }
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function prepare(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      accept(await client.prepare(profile, leadId));
      setSelected("");
      setArtifact("");
      setPilotForm(false);
      setNotice(
        "Personalized demonstration prepared. All business data is fictional.",
      );
      void sessions.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preparation failed");
    } finally {
      setBusy(false);
    }
  }
  if (auth.isDevMode)
    return (
      <Alert>
        Sales demonstrations require a real authenticated sales or SUPER_ADMIN
        session. Sign out of development preview and sign in normally.
      </Alert>
    );
  if (!allowed)
    return (
      <Alert tone="destructive">
        Your account does not have sales demonstration access.
      </Alert>
    );
  const s = demo?.snapshot,
    summary = demo?.summary;
  const charge = s?.charges.find((c) => c.id === selected),
    unit = charge ? s?.units.find((u) => u.id === charge.unitId) : undefined;
  const focusedMaintenance =
    s?.maintenance.find((m) => m.id === selected) ??
    s?.maintenance.find((m) => m.status === "APPROVAL_REQUIRED") ??
    s?.maintenance[0];
  const story = catalog.data?.stories.find((story) => story.id === pane);
  const act = (kind: DemoAction["kind"], resourceId?: string) => {
    void run(resourceId ? { kind, resourceId } : { kind });
  };
  async function offer() {
    if (!demo) return;
    let current = demo;
    setBusy(true);
    setError("");
    try {
      if (!current.snapshot.history.some((h) => h.action === "demo.completed"))
        current = await client.command(current, { kind: "COMPLETE_DEMO" });
      if (!current.snapshot.history.some((h) => h.action === "pilot.offered"))
        current = await client.command(current, { kind: "OFFER_PILOT" });
      setDemo(current);
      setPilotName(current.profile.companyName);
      setPilotForm(true);
      setNotice(
        "Everything shown used demonstration data. Let’s prepare a property using your own operation.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Complete a business action first",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto min-w-0 max-w-[1500px] space-y-6 [overflow-wrap:anywhere]">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-muted-foreground">
            Sales · guided value experience
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Experience a better way to run the portfolio.
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Start with a real frustration. Quantify it, investigate the cause,
            act, and show what changes.
          </p>
        </div>
        <Link href="/sales-intelligence" className="btn-secondary">
          Conversion intelligence <ArrowRight size={16} />
        </Link>
      </header>
      {error && <Alert tone="destructive">{error}</Alert>}
      {catalog.error && (
        <Alert tone="destructive">
          {catalog.error.message}
          <Button variant="link" onClick={() => void catalog.refetch()}>
            Retry catalog
          </Button>
        </Alert>
      )}
      <p
        role="status"
        aria-live="polite"
        className="min-h-5 max-w-full break-words text-sm font-medium"
      >
        {notice || (busy ? "Applying business action…" : "")}
      </p>
      {!demo ? (
        <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          <Pane title="Prepare a pain-first demo">
            <form onSubmit={prepare} className="mt-5 space-y-5">
              <label className="block text-sm font-medium">
                Prospect / company name
                <Input
                  required
                  minLength={2}
                  maxLength={160}
                  value={profile.companyName}
                  onChange={(e) =>
                    setProfile({ ...profile, companyName: e.target.value })
                  }
                  className="mt-2"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">
                  Primary pain
                  <select
                    className={fieldClass}
                    aria-label="Primary pain"
                    value={profile.primaryPain}
                    onChange={(e) => {
                      const pain = e.target.value as DemoStory;
                      setProfile({
                        ...profile,
                        primaryPain: pain,
                        ...(pain === "SECURITY" ? { plan: "FORT_KNOX" } : {}),
                        ...(pain === "EXECUTIVE"
                          ? { template: "EXECUTIVE", executiveApartments: true }
                          : {}),
                      });
                    }}
                  >
                    {catalog.data?.stories.map((story) => (
                      <option value={story.id} key={story.id}>
                        {story.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium">
                  Plan
                  <select
                    className={fieldClass}
                    value={profile.plan}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        plan: e.target.value as DemoProfile["plan"],
                        ...(e.target.value === "CONTROL" &&
                        profile.primaryPain === "SECURITY"
                          ? { primaryPain: "RENT" }
                          : {}),
                      })
                    }
                  >
                    <option value="CONTROL">
                      Control · run your properties
                    </option>
                    <option value="FORT_KNOX">
                      Fort Knox · operate, protect, monitor
                    </option>
                  </select>
                </label>
              </div>
              <label className="block text-sm font-medium">
                Deterministic template
                <select
                  className={fieldClass}
                  value={profile.template}
                  onChange={(e) =>
                    setProfile({ ...profile, template: e.target.value })
                  }
                >
                  {catalog.data?.templates.map((t) => (
                    <option value={t.id} key={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">
                  Estimated units (optional)
                  <Input
                    type="number"
                    min={10}
                    max={2000}
                    value={profile.units ?? ""}
                    onChange={(e) => {
                      const next = { ...profile };
                      if (e.target.value) next.units = Number(e.target.value);
                      else delete next.units;
                      setProfile(next);
                    }}
                    className="mt-2"
                  />
                </label>
                <label className="text-sm font-medium">
                  Estimated properties (optional)
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={profile.properties ?? ""}
                    onChange={(e) => {
                      const next = { ...profile };
                      if (e.target.value)
                        next.properties = Number(e.target.value);
                      else delete next.properties;
                      setProfile(next);
                    }}
                    className="mt-2"
                  />
                </label>
              </div>
              <details className="rounded-xl border border-border p-4">
                <summary className="cursor-pointer text-sm font-medium">
                  Personalize discovery details (optional)
                </summary>
                <p className="mt-3 text-xs text-muted-foreground">
                  Record only useful discovery context. Do not enter IDs, bank
                  details, tenant records or credentials.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {optionalFields.map(([key, label]) => (
                    <label className="text-sm" key={key}>
                      {label}
                      <Input
                        maxLength={500}
                        value={String(profile[key] ?? "")}
                        onChange={(e) =>
                          setProfile({ ...profile, [key]: e.target.value })
                        }
                        className="mt-2"
                      />
                    </label>
                  ))}
                  <label className="text-sm">
                    Residential / commercial / mixed use
                    <select
                      className={fieldClass}
                      value={profile.use ?? "RESIDENTIAL"}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          use: e.target.value as NonNullable<
                            DemoProfile["use"]
                          >,
                        })
                      }
                    >
                      <option>RESIDENTIAL</option>
                      <option>COMMERCIAL</option>
                      <option>MIXED_USE</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    Approximate occupancy %
                    <Input
                      type="number"
                      min={10}
                      max={100}
                      value={profile.occupancy ?? ""}
                      onChange={(e) => {
                        const next = { ...profile };
                        if (e.target.value)
                          next.occupancy = Number(e.target.value);
                        else delete next.occupancy;
                        setProfile(next);
                      }}
                      className="mt-2"
                    />
                  </label>
                  <label className="text-sm">
                    Voluntarily shared monthly rent roll (KES)
                    <Input
                      type="number"
                      min={1000}
                      step=".01"
                      value={
                        profile.monthlyRentRollMinor !== undefined
                          ? profile.monthlyRentRollMinor / 100
                          : ""
                      }
                      onChange={(e) => {
                        const next = { ...profile };
                        if (e.target.value)
                          next.monthlyRentRollMinor = Math.round(
                            Number(e.target.value) * 100,
                          );
                        else delete next.monthlyRentRollMinor;
                        setProfile(next);
                      }}
                      className="mt-2"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={profile.executiveApartments ?? false}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          executiveApartments: e.target.checked,
                        })
                      }
                    />
                    Executive apartments
                  </label>
                </div>
              </details>
              <Button type="submit" loading={busy} disabled={!catalog.data}>
                <Target size={16} />
                Prepare demo
              </Button>
              <p className="text-xs text-muted-foreground">
                Plan determines capability. Unit count determines scale. Large
                portfolios can use Control.
              </p>
            </form>
          </Pane>
          <div className="space-y-6">
            <Pane title="Start with discovery">
              <ul className="mt-4 space-y-4 text-sm text-muted-foreground">
                <li>How do you know how much rent is outstanding right now?</li>
                <li>
                  How many people do you call to understand what happened?
                </li>
                <li>How do you verify a repair and its final cost?</li>
                <li>What frustrates you most about managing the portfolio?</li>
              </ul>
              <p className="mt-6 text-sm font-medium">
                Pick one problem with the greatest consequence.
              </p>
            </Pane>
            <Pane title="Resume a prospect">
              <div className="mt-4 space-y-3">
                {sessions.isLoading && (
                  <p role="status">Loading saved demonstrations…</p>
                )}
                {sessions.error && (
                  <Alert tone="destructive">{sessions.error.message}</Alert>
                )}
                {sessions.data?.items.map((item) => (
                  <Button
                    variant="outline"
                    key={item.id}
                    disabled={busy}
                    className="w-full justify-between"
                    onClick={async () => {
                      setBusy(true);
                      try {
                        accept(await client.get(item.id));
                      } catch (e) {
                        setError(
                          e instanceof Error ? e.message : "Demo unavailable",
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {item.profile.companyName}
                    <ArrowRight size={15} />
                  </Button>
                ))}
                {sessions.data?.total === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No demonstrations prepared yet.
                  </p>
                )}
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </Button>
                  <span className="text-sm">Page {page}</span>
                  <Button
                    variant="outline"
                    disabled={page * 20 >= (sessions.data?.total ?? 0)}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </Pane>
          </div>
        </div>
      ) : (
        s &&
        summary && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-5">
              <div>
                <p className="text-xs font-bold tracking-wider">
                  DEMO DATA · {s.plan === "CONTROL" ? "CONTROL" : "FORT KNOX"} ·
                  FICTIONAL PORTFOLIO
                </p>
                <h2 className="mt-1 text-2xl font-semibold">
                  {s.organizationName}
                </h2>
                {demo.profile.objective && (
                  <p className="mt-2 text-sm font-medium">
                    Your objective: {demo.profile.objective}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  Scenario date:{" "}
                  {new Date(s.clock).toLocaleString("en-KE", {
                    timeZone: "Africa/Nairobi",
                  })}{" "}
                  · {s.units.length} units
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    void run({ kind: "RESET" }).then((v) => {
                      if (v) {
                        setSelected("");
                        setArtifact("");
                        setPilotForm(false);
                        setPane(v.profile.primaryPain);
                      }
                    });
                  }}
                >
                  <RotateCcw size={15} />
                  Reset demo
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setDemo(null);
                    setLeadId(undefined);
                    setProfile({
                      companyName: "",
                      primaryPain: "RENT",
                      plan: "CONTROL",
                      template: "CONTROL_150",
                    });
                    setOwnerEmail("");
                    setPilotName("");
                    setPilotForm(false);
                    setNotice("");
                    setSelected("");
                    setArtifact("");
                    window.history.replaceState(null, "", "/sales-demo");
                  }}
                >
                  Prepare another prospect
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  label: "Expected",
                  value: kes(summary.expectedMinor),
                  kind: "RENT" as DemoStory,
                  icon: CircleDollarSign,
                },
                {
                  label: "Collected",
                  value: kes(summary.collectedMinor),
                  kind: "RENT" as DemoStory,
                  icon: CheckCircle2,
                },
                {
                  label: "Outstanding",
                  value: kes(summary.outstandingMinor),
                  kind: "RENT" as DemoStory,
                  icon: CircleDollarSign,
                },
                {
                  label: "Overdue tenants",
                  value: String(summary.overdueTenants),
                  kind: "RENT" as DemoStory,
                  icon: Users,
                },
                {
                  label: "Occupancy",
                  value: `${summary.occupancy}%`,
                  kind: "VACANCY" as DemoStory,
                  icon: Building2,
                },
                {
                  label: "Open repairs",
                  value: String(summary.openMaintenance),
                  kind: "MAINTENANCE" as DemoStory,
                  icon: Wrench,
                },
              ].map((metric) => (
                <button
                  key={metric.label}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setSelected("");
                    if (metric.kind === "RENT")
                      void run({ kind: "REVEAL_ARREARS" }, "RENT");
                    else setPane(metric.kind);
                  }}
                  className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <metric.icon
                    size={16}
                    className="text-muted-foreground"
                    aria-hidden="true"
                  />
                  <p className="mt-3 text-xs text-muted-foreground">
                    {metric.label}
                  </p>
                  <strong className="mt-1 block whitespace-nowrap text-2xl font-semibold tracking-tight xl:text-3xl">
                    {metric.value}
                  </strong>
                  <span className="mt-2 block text-xs text-muted-foreground">
                    Investigate <ArrowRight className="inline" size={11} />
                  </span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <span>
                Collection: <strong>{summary.collectionPercent}%</strong>
              </span>
              <span>
                <strong>{summary.approvals}</strong> approvals waiting
              </span>
              <span>Every action below is simulated.</span>
            </div>
            <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
              <aside className="space-y-5">
                <Pane title="What needs your attention today?">
                  <ul className="mt-4 space-y-2">
                    {summary.attention.map((a) => (
                      <li key={a.id}>
                        <button
                          disabled={busy}
                          className="w-full rounded-xl border border-border p-3 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
                          onClick={() => {
                            setSelected(a.id);
                            setPane(
                              a.kind === "RENT"
                                ? "RENT"
                                : a.kind === "SECURITY"
                                  ? "SECURITY"
                                  : a.kind,
                            );
                            if (a.kind === "RENT") act("OPEN_TENANCY", a.id);
                            if (a.kind === "VACANCY")
                              act("REVEAL_VACANCY", a.id);
                          }}
                        >
                          <strong className="block text-sm">{a.title}</strong>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {a.detail}
                          </span>
                          {a.amountMinor !== undefined && (
                            <span className="mt-1 block text-sm font-semibold">
                              {kes(a.amountMinor)}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </Pane>
                <label className="block rounded-xl border border-border bg-card p-4 text-sm">
                  Investigate a problem
                  <select
                    value={pane}
                    className={fieldClass}
                    onChange={(e) => {
                      setPane(e.target.value as DemoStory);
                      setSelected("");
                    }}
                  >
                    {catalog.data?.stories
                      .filter(
                        (story) =>
                          s.plan === "FORT_KNOX" || story.id !== "SECURITY",
                      )
                      .map((story) => (
                        <option value={story.id} key={story.id}>
                          {story.name}
                        </option>
                      ))}
                  </select>
                </label>
              </aside>
              <div className="min-w-0 space-y-6">
                <Pane
                  title={
                    story?.question ??
                    "Investigate, act, understand the outcome"
                  }
                >
                  {(pane === "RENT" ||
                    pane === "FULL" ||
                    pane === "PORTFOLIO") && (
                    <div className="mt-5 space-y-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <strong className="text-3xl">
                            {kes(summary.outstandingMinor)}
                          </strong>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Outstanding across{" "}
                            {
                              new Set(
                                s.charges
                                  .filter((c) => c.balanceMinor)
                                  .map(
                                    (c) =>
                                      s.units.find((u) => u.id === c.unitId)
                                        ?.property,
                                  ),
                              ).size
                            }{" "}
                            properties. Select a tenancy to investigate.
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => act("REVEAL_ARREARS")}
                        >
                          Reveal arrears exposure
                        </Button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[560px] text-left text-sm">
                          <caption className="sr-only">
                            Outstanding rent by property, unit and tenancy
                          </caption>
                          <thead>
                            <tr className="border-b border-border text-xs text-muted-foreground">
                              <th className="p-3">Property / unit</th>
                              <th className="p-3">Tenant</th>
                              <th className="p-3">Outstanding</th>
                              <th className="p-3">Status</th>
                              <th className="p-3">Investigate</th>
                            </tr>
                          </thead>
                          <tbody>
                            {s.charges
                              .filter((c) => c.balanceMinor > 0)
                              .slice(0, 30)
                              .map((c) => {
                                const u = s.units.find(
                                  (u) => u.id === c.unitId,
                                )!;
                                return (
                                  <tr
                                    key={c.id}
                                    className="border-b border-border"
                                  >
                                    <td className="p-3">
                                      {u.property}
                                      <strong className="block">
                                        {u.building} / {u.floor} / {u.code}
                                      </strong>
                                    </td>
                                    <td className="p-3">{u.tenant}</td>
                                    <td className="p-3 font-semibold">
                                      {kes(c.balanceMinor)}
                                    </td>
                                    <td className="p-3">
                                      <DemoStatus status={c.status} />
                                    </td>
                                    <td className="p-3">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={busy}
                                        onClick={() => {
                                          setSelected(c.id);
                                          act("OPEN_TENANCY", c.id);
                                        }}
                                      >
                                        Investigate {u.code}
                                      </Button>
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                      {charge && unit && (
                        <section
                          className="rounded-xl border border-primary/40 bg-primary/5 p-5"
                          aria-label="Tenancy investigation"
                        >
                          <h3 className="text-lg font-semibold">
                            {unit.tenant} · Unit {unit.code}
                          </h3>
                          <p className="mt-2 text-sm">
                            {unit.property} → {unit.building} → {unit.floor} →{" "}
                            {unit.code} → {charge.tenancyId}
                          </p>
                          <div className="mt-4 flex flex-wrap gap-5">
                            <div>
                              <small>Outstanding</small>
                              <strong className="block text-2xl">
                                {kes(charge.balanceMinor)}
                              </strong>
                            </div>
                            <div>
                              <small>Due date</small>
                              <strong className="block">
                                {charge.dueAt.slice(0, 10)}
                              </strong>
                            </div>
                            <DemoStatus status={charge.status} />
                          </div>
                          <p className="mt-4 text-sm">
                            Previous follow-up: {charge.followUp}
                          </p>
                          <h4 className="mt-5 text-sm font-semibold">
                            Payment and ledger history
                          </h4>
                          <ul className="mt-2 space-y-2 text-sm">
                            {charge.history.map((h, i) => (
                              <li
                                key={i}
                                className="flex flex-wrap justify-between gap-2"
                              >
                                <span>
                                  {h.at.slice(0, 10)} · {h.label}
                                </span>
                                <strong>{kes(h.amountMinor)}</strong>
                              </li>
                            ))}
                          </ul>
                          <div className="mt-5 flex flex-wrap gap-3">
                            <Button
                              disabled={busy || charge.balanceMinor === 0}
                              onClick={() => act("SIMULATE_PAYMENT", charge.id)}
                            >
                              Simulate payment
                            </Button>
                            <Button
                              variant="outline"
                              disabled={busy || charge.balanceMinor === 0}
                              onClick={() => act("FOLLOW_UP", charge.id)}
                            >
                              Simulate statement / SMS
                            </Button>
                          </div>
                          <p className="mt-3 text-xs text-muted-foreground">
                            SIMULATED PAYMENT. No M-Pesa, Paystack, bank
                            transfer, email or SMS is invoked.
                          </p>
                        </section>
                      )}
                      <details className="rounded-xl border border-border p-4">
                        <summary className="cursor-pointer text-sm font-medium">
                          Watch new rent become due
                        </summary>
                        <p className="mt-3 text-sm text-muted-foreground">
                          Create a charge, advance the scenario clock and watch
                          the ledger and attention queue change.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-3">
                          <Button
                            disabled={
                              busy ||
                              s.charges.some(
                                (c) =>
                                  c.id === `demo-next-charge-${s.units[0]?.id}`,
                              )
                            }
                            onClick={() => act("RENT_DUE", s.units[0]?.id)}
                          >
                            Simulate rent becoming due
                          </Button>
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => act("ADVANCE_OVERDUE")}
                          >
                            Advance demo clock · 7 days
                          </Button>
                        </div>
                      </details>
                    </div>
                  )}
                  {(pane === "MAINTENANCE" ||
                    pane === "EXPENSES" ||
                    pane === "EXECUTIVE" ||
                    pane === "FULL") && (
                    <div className="mt-5 space-y-5">
                      {pane === "EXECUTIVE" && (
                        <p className="rounded-xl bg-muted p-4 text-sm leading-6">
                          Your tenant should not need someone’s WhatsApp number
                          for service. A structured request connects tenant →
                          management → maintenance → approval → expenditure →
                          evidence → professional resolution.
                        </p>
                      )}
                      <div className="flex flex-wrap gap-3">
                        <Button
                          variant="outline"
                          disabled={
                            busy ||
                            s.maintenance.some(
                              (m) => m.id === "demo-maintenance-new-leak",
                            )
                          }
                          onClick={() => {
                            void run({ kind: "REPORT_LEAK" }).then((v) => {
                              if (v) setSelected("demo-maintenance-new-leak");
                            });
                          }}
                        >
                          Simulate tenant reporting a leak
                        </Button>
                        <label className="flex-1 text-sm">
                          Investigate repair
                          <select
                            className={fieldClass}
                            value={focusedMaintenance?.id ?? ""}
                            onChange={(e) => setSelected(e.target.value)}
                          >
                            {s.maintenance.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.title} · {m.status.replaceAll("_", " ")}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      {focusedMaintenance && (
                        <RepairStory
                          repair={focusedMaintenance}
                          busy={busy}
                          act={act}
                          evidence={(id) => {
                            setArtifact(id);
                            act("READ_EVIDENCE", id);
                          }}
                        />
                      )}
                    </div>
                  )}
                  {(pane === "VACANCY" ||
                    pane === "PORTFOLIO" ||
                    pane === "FULL") && (
                    <div className="mt-5 space-y-4">
                      {s.units
                        .filter((u) => u.status === "VACANT")
                        .slice(0, 15)
                        .map((u) => (
                          <article
                            className="rounded-xl border border-border p-4"
                            key={u.id}
                          >
                            <div className="flex flex-wrap justify-between gap-3">
                              <h3 className="font-semibold">
                                {u.code} · {u.property}
                              </h3>
                              <DemoStatus status="VACANT" />
                            </div>
                            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                              <div>
                                <dt>Previous tenancy ended</dt>
                                <dd className="font-semibold">
                                  {u.previousTenancyEnd?.slice(0, 10)}
                                </dd>
                              </div>
                              <div>
                                <dt>Days vacant</dt>
                                <dd className="font-semibold">
                                  {u.vacantDays}
                                </dd>
                              </div>
                              <div>
                                <dt>Expected monthly rent</dt>
                                <dd className="font-semibold">
                                  {kes(u.monthlyRentMinor)}
                                </dd>
                              </div>
                              <div>
                                <dt>Vacancy exposure estimate</dt>
                                <dd className="font-semibold">
                                  {kes(u.vacancyExposureMinor ?? 0)}
                                </dd>
                              </div>
                            </dl>
                            <p className="mt-3 text-xs text-muted-foreground">
                              Rent × vacant days / 30. Exposure is an estimate,
                              not confirmed loss. No occupancy guarantee.
                            </p>
                            <p className="mt-3 text-sm">
                              Next action: {u.vacancyAction}
                            </p>
                            <div className="mt-4 flex flex-wrap gap-3">
                              <Button
                                variant="outline"
                                disabled={busy}
                                onClick={() => act("REVEAL_VACANCY", u.id)}
                              >
                                Reveal vacancy exposure
                              </Button>
                              <Button
                                disabled={
                                  busy || u.vacancyAction === "Viewing assigned"
                                }
                                onClick={() => act("VACANCY_ACTION", u.id)}
                              >
                                Assign viewing and readiness review
                              </Button>
                            </div>
                          </article>
                        ))}
                      <section className="rounded-xl border border-border p-4">
                        <h3 className="font-semibold">
                          Upcoming lease end reviews
                        </h3>
                        <ul className="mt-3 space-y-2 text-sm">
                          {s.units
                            .filter(
                              (u) =>
                                u.leaseEndsAt &&
                                Date.parse(u.leaseEndsAt) >
                                  Date.parse(s.clock) &&
                                Date.parse(u.leaseEndsAt) <=
                                  Date.parse(s.clock) + 30 * 86400000,
                            )
                            .slice(0, 5)
                            .map((u) => (
                              <li key={u.id}>
                                {u.code} · {u.property} · ends{" "}
                                {u.leaseEndsAt?.slice(0, 10)}
                                <p className="text-xs text-muted-foreground">
                                  Next: confirm renewal intention with the
                                  tenant.
                                </p>
                              </li>
                            ))}
                        </ul>
                      </section>
                      {!s.units.some((u) => u.status === "VACANT") && (
                        <p>
                          No vacant units in this selected occupancy scenario.
                        </p>
                      )}
                    </div>
                  )}
                  {(pane === "STAFF" || pane === "FULL") && (
                    <div className="mt-5">
                      {s.staff.map((t) => (
                        <article
                          key={t.id}
                          className="rounded-xl border border-border p-5"
                        >
                          <h3 className="font-semibold">{t.assignment}</h3>
                          <div className="mt-3">
                            <DemoStatus status={t.status} />
                          </div>
                          <dl className="mt-4 space-y-2 text-sm">
                            <div>
                              <dt className="text-muted-foreground">
                                Responsible
                              </dt>
                              <dd>{t.responsible}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">
                                Assigned / deadline
                              </dt>
                              <dd>
                                {t.assignedAt.slice(0, 10)} /{" "}
                                {t.deadline.slice(0, 10)}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">
                                Evidence
                              </dt>
                              <dd>{t.evidence}</dd>
                            </div>
                            {t.approvedBy && (
                              <div>
                                <dt>Completion approved by</dt>
                                <dd>{t.approvedBy}</dd>
                              </div>
                            )}
                          </dl>
                          <div className="mt-4 flex flex-wrap gap-3">
                            <Button
                              variant="outline"
                              disabled={busy || t.status !== "OVERDUE"}
                              onClick={() => act("ESCALATE_TASK", t.id)}
                            >
                              Escalate overdue task
                            </Button>
                            <Button
                              disabled={busy || t.status === "COMPLETED"}
                              onClick={() => act("COMPLETE_TASK", t.id)}
                            >
                              Simulate completion and verification
                            </Button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                  {pane === "SECURITY" && s.plan === "FORT_KNOX" && (
                    <div className="mt-5 space-y-5">
                      <div className="rounded-xl border border-blue-600/40 bg-blue-500/10 p-5">
                        <ShieldCheck size={28} />
                        <p className="mt-3 font-semibold">
                          DEMO / SIMULATED SECURITY EVENT
                        </p>
                        <p className="mt-2 text-sm">
                          Run, protect and deeply monitor the asset. Synthetic
                          telemetry is used; no live camera or hardware
                          connection is represented.
                        </p>
                        <Button
                          className="mt-4"
                          disabled={
                            busy ||
                            s.incidents.some((i) => i.status !== "RESOLVED")
                          }
                          onClick={() => act("SIMULATE_SECURITY")}
                        >
                          Simulate 02:14 AM security event
                        </Button>
                      </div>
                      {s.incidents.map((i) => (
                        <article
                          key={i.id}
                          className="rounded-xl border border-border p-5"
                        >
                          <h3 className="text-lg font-semibold">
                            02:14 AM · {i.property}
                          </h3>
                          <div className="mt-3">
                            <DemoStatus status={i.status} />
                          </div>
                          <p className="mt-3 text-sm">
                            Exact location: {i.location}
                            <br />
                            Source: {i.camera}
                            <br />
                            Responsible: {i.responsible}
                          </p>
                          <p className="mt-3 text-sm">{i.response}</p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button
                              disabled={busy || i.status !== "OPEN"}
                              onClick={() => act("INVESTIGATE_INCIDENT", i.id)}
                            >
                              Investigate incident
                            </Button>
                            <Button
                              variant="outline"
                              disabled={busy || i.status !== "INVESTIGATING"}
                              onClick={() => act("ESCALATE_INCIDENT", i.id)}
                            >
                              Escalate response
                            </Button>
                            <Button
                              disabled={
                                busy ||
                                !["INVESTIGATING", "ESCALATED"].includes(
                                  i.status,
                                )
                              }
                              onClick={() => act("RESOLVE_INCIDENT", i.id)}
                            >
                              Resolve incident
                            </Button>
                            {i.evidenceIds.map((id) => (
                              <Button
                                key={id}
                                variant="outline"
                                disabled={busy}
                                onClick={() => {
                                  setArtifact(id);
                                  act("READ_EVIDENCE", id);
                                }}
                              >
                                Retrieve incident evidence
                              </Button>
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </Pane>
                {artifact && s.evidence.find((e) => e.id === artifact) && (
                  <Pane title="Evidence retained">
                    <div className="mt-3 space-y-3 break-words text-sm">
                      <p className="font-semibold">
                        {s.evidence.find((e) => e.id === artifact)?.title}
                      </p>
                      <p>
                        {s.evidence.find((e) => e.id === artifact)?.content}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        DEMO EVIDENCE ·{" "}
                        {s.evidence.find((e) => e.id === artifact)?.at}
                      </p>
                      <p className="font-mono text-xs">
                        SHA-256:{" "}
                        {s.evidence.find((e) => e.id === artifact)?.sha256}
                      </p>
                    </div>
                  </Pane>
                )}
                <Pane title="Outcome and operational history">
                  <ol className="mt-4 space-y-4">
                    {s.history
                      .slice(-12)
                      .reverse()
                      .map((h, index) => (
                        <li
                          key={index}
                          className="border-l-2 border-primary/30 pl-4 text-sm"
                        >
                          <p className="font-semibold">{h.outcome}</p>
                          <p className="mt-1 break-words text-xs text-muted-foreground">
                            {h.at} · {h.actor} · {h.action}
                          </p>
                        </li>
                      ))}
                  </ol>
                  <details className="mt-5">
                    <summary className="cursor-pointer text-sm font-medium">
                      <History size={15} className="mr-2 inline" />
                      Persistent audit / sales evidence across resets
                    </summary>
                    <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                      {demo.events.map((e, i) => (
                        <li key={i}>
                          {e.at} · run {e.generation} · {e.kind} ·{" "}
                          {e.resourceId}
                        </li>
                      ))}
                    </ul>
                  </details>
                </Pane>
              </div>
            </div>
            <details className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-border bg-card p-5">
              <summary className="cursor-pointer text-sm font-semibold">
                Historical context · six months of demonstration data
              </summary>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[500px] text-left text-sm">
                  <caption className="sr-only">
                    Fictional collection, occupancy and repairs history
                  </caption>
                  <thead>
                    <tr className="border-b border-border">
                      <th className="p-3">Month</th>
                      <th className="p-3">Expected</th>
                      <th className="p-3">Collected</th>
                      <th className="p-3">Occupancy</th>
                      <th className="p-3">Repairs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.trends.map((t) => (
                      <tr className="border-b border-border" key={t.month}>
                        <th scope="row" className="p-3">
                          {t.month}
                        </th>
                        <td className="p-3">{kes(t.expectedMinor)}</td>
                        <td className="p-3">
                          {kes(
                            t.month === "September"
                              ? summary.collectedMinor
                              : t.collectedMinor,
                          )}
                        </td>
                        <td className="p-3">{t.occupancy}%</td>
                        <td className="p-3">{t.repairs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <Pane title="From demonstration to your own property">
              <p className="mt-3 text-sm text-muted-foreground">
                Everything you have just seen used demonstration data. Prepare a
                workspace where you experience this with your own operation.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button disabled={busy} onClick={() => void offer()}>
                  Start guided pilot <ArrowRight size={16} />
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void offer()}
                >
                  Prepare my property
                </Button>
                {s.plan === "CONTROL" && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void offer()}
                  >
                    Start with Control
                  </Button>
                )}
                {s.plan === "CONTROL" && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDemo(null);
                      setProfile({
                        ...profile,
                        plan: "FORT_KNOX",
                        primaryPain: "SECURITY",
                        template: "FORT_SECURITY",
                      });
                      window.history.replaceState(null, "", "/sales-demo");
                    }}
                  >
                    Explore Fort Knox
                  </Button>
                )}
              </div>
              {pilotForm && (
                <form
                  className="mt-6 max-w-xl space-y-4"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    setError("");
                    try {
                      const value = await client.pilot(
                        demo.id,
                        ownerEmail,
                        pilotName,
                      );
                      setDemo(value.demo);
                      setNotice(
                        "Guided pilot workspace prepared. The owner can now sign in and open Guided pilot.",
                      );
                      setPilotForm(false);
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Pilot preparation failed",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <p className="text-sm">
                    The prospect first signs up and verifies their account. Use
                    their verified account email to bind this private workspace.
                  </p>
                  <label className="block text-sm">
                    Verified owner account email
                    <Input
                      type="email"
                      required
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                      className="mt-2"
                    />
                  </label>
                  <label className="block text-sm">
                    Workspace name
                    <Input
                      required
                      value={pilotName}
                      onChange={(e) => setPilotName(e.target.value)}
                      className="mt-2"
                    />
                  </label>
                  <Button type="submit" loading={busy}>
                    Prepare guided pilot workspace
                  </Button>
                  <Link
                    href="/signup"
                    target="_blank"
                    className="ml-4 text-sm underline"
                  >
                    Owner signup
                  </Link>
                </form>
              )}
              {demo.pilotOrganizationId && (
                <Link
                  className="btn-secondary mt-4 inline-flex"
                  href={`/pilot?organizationId=${demo.pilotOrganizationId}`}
                >
                  Open prepared pilot workspace <ArrowRight size={16} />
                </Link>
              )}
              <details className="mt-6 text-sm">
                <summary className="cursor-pointer font-medium">
                  The operating model changes
                </summary>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <p className="rounded-xl bg-muted p-4">
                    Before: WhatsApp, spreadsheets, phone calls, separate CCTV,
                    accounting, files and people’s memories.
                  </p>
                  <p className="rounded-xl bg-primary/5 p-4">
                    Now: money, property, tenants, work, people, approvals and
                    evidence in one operational picture. Fort Knox adds
                    security, monitoring and investigation.
                  </p>
                </div>
              </details>
            </Pane>
          </>
        )
      )}
    </div>
  );
}
function RepairStory({
  repair: m,
  busy,
  act,
  evidence,
}: {
  repair: DemoMaintenance;
  busy: boolean;
  act: (kind: DemoAction["kind"], id?: string) => void;
  evidence: (id: string) => void;
}) {
  const next: Partial<
    Record<
      DemoMaintenance["status"],
      { kind: DemoAction["kind"]; label: string }
    >
  > = {
    NEW: { kind: "TRIAGE", label: "Triage request" },
    TRIAGED: { kind: "ASSIGN", label: "Assign caretaker / contractor" },
    ASSIGNED: { kind: "QUOTE", label: "Submit simulated quotation" },
    APPROVAL_REQUIRED: {
      kind: "APPROVE_MAINTENANCE",
      label: "Approve maintenance",
    },
    APPROVED: { kind: "START_WORK", label: "Start work" },
    IN_PROGRESS: { kind: "COMPLETE_REPAIR", label: "Complete repair" },
    COMPLETED: { kind: "VERIFY_REPAIR", label: "Verify completion" },
    VERIFIED: { kind: "CLOSE_REPAIR", label: "Close repair" },
  };
  const action = next[m.status];
  return (
    <article className="rounded-xl border border-border p-5">
      <div className="flex flex-wrap justify-between gap-3">
        <h3 className="text-lg font-semibold">{m.title}</h3>
        <DemoStatus status={m.status} />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{m.description}</p>
      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Requested by</dt>
          <dd>{m.requestedBy}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Responsible person</dt>
          <dd>{m.responsible}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Worker / contractor</dt>
          <dd>{m.contractor}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Assigned / deadline</dt>
          <dd>
            {m.assignedAt.slice(0, 10)} / {m.deadline.slice(0, 10)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Quotation / approved budget</dt>
          <dd>
            {kes(m.quoteMinor)} /{" "}
            {m.approvedMinor !== undefined
              ? kes(m.approvedMinor)
              : "Awaiting approval"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Final expenditure</dt>
          <dd className="font-semibold">
            {m.finalCostMinor !== undefined
              ? kes(m.finalCostMinor)
              : "Work pending"}
          </dd>
        </div>
        {m.approvedBy && (
          <div>
            <dt className="text-muted-foreground">Approved by</dt>
            <dd className="break-all">{m.approvedBy}</dd>
          </div>
        )}
        {m.completionApprovedBy && (
          <div>
            <dt className="text-muted-foreground">Completion verified by</dt>
            <dd className="break-all">{m.completionApprovedBy}</dd>
          </div>
        )}
      </dl>
      <p className="mt-4 rounded-lg bg-muted p-3 text-sm">
        Tenant service status: {m.serviceStatus}
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        {action && (
          <Button disabled={busy} onClick={() => act(action.kind, m.id)}>
            {action.label}
          </Button>
        )}
        {m.evidenceIds.map((id, i) => (
          <Button
            variant="outline"
            disabled={busy}
            key={id}
            onClick={() => evidence(id)}
          >
            {i === 0
              ? "Before evidence"
              : i === 1
                ? "Quotation"
                : i === 2
                  ? "After evidence"
                  : "Invoice / receipt"}
          </Button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Simulated approval, work and expenditure. Evidence stays attached to the
        request.
      </p>
    </article>
  );
}
