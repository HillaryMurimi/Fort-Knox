"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { StatusBadge, EmptyState, PageTitle, SectionHeader, Stat } from "@/components/ui";
import * as I from "@/components/icons";
import { money, pct } from "@/lib/utils";
import { useOrganization } from "@/hooks/use-organization";
import {
  useCommandCenterQuery,
  useEvaluateIntelligenceMutation,
  useUpdateIntelligenceAlertMutation,
} from "@/hooks/queries/use-command-center-queries";
import type { CommandCenterProperty } from "@/types/api";
import { LandlordControlPanel } from "@/components/landlords/landlord-control-panel";
import { WorkspaceScene } from "@/components/workspaces/workspace-scene";

type Range = "7D" | "30D" | "90D";

function isoDate(daysAgo: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
}





function healthBar(score: number) {
  if (score >= 90) return "bg-[var(--status-success-text)]";
  if (score >= 75) return "bg-[var(--status-success-text)]";
  if (score >= 60) return "bg-[var(--status-attention-text)]";
  return "bg-[var(--status-blocked-text)]";
}

function propertyAddress(property: CommandCenterProperty) {
  const address = property.property.address;
  const parts = [address.city, address.country].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  return (
    parts.join(", ") || property.property.propertyType.replaceAll("_", " ")
  );
}

export default function Dashboard() {
  const {
    activeOrganizationId,
    activeOrganization,
    refreshOrganizations,
    isLoading: organizationLoading,
    error: organizationError,
  } = useOrganization();
  const [range, setRange] = useState<Range>("30D");
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(
    null,
  );

  const params = useMemo(
    () => ({ from: isoDate(range === "7D" ? 7 : range === "30D" ? 30 : 90) }),
    [range],
  );
  const dashboardQuery = useCommandCenterQuery(activeOrganizationId, params);
  const evaluate = useEvaluateIntelligenceMutation(activeOrganizationId);
  const updateAlert = useUpdateIntelligenceAlertMutation(activeOrganizationId);
  const data = dashboardQuery.data;
  const selectedProperty =
    data?.properties.find((item) => item.property._id === selectedPropertyId) ??
    data?.properties[0];
  const p = data?.portfolio;

  const actionQueue = useMemo(() => {
    if (!data) return [];
    return data.properties.flatMap((item) =>
      item.actions.map((action) => ({
        ...action,
        propertyId: item.property._id,
        propertyName: item.property.name,
      })),
    );
  }, [data]);

  const netCash = (p?.cashCollected ?? 0) - (p?.expenses ?? 0);
  const occupancyRate = p?.units ? (p.occupiedUnits / p.units) * 100 : 0;
  const cameraAvailability =
    p?.offlineCameras === undefined
      ? 0
      : Math.max(
          0,
          100 - (p.offlineCameras / Math.max(1, p.propertyCount)) * 100,
        );

  function refreshIntelligence() {
    if (!activeOrganizationId) return;
    void evaluate
      .mutateAsync(params)
      .then(() => dashboardQuery.refetch())
      .catch(() => undefined);
  }

  if (organizationLoading) {
    return <DashboardSkeleton />;
  }

  if (!activeOrganizationId) {
    return (
      <EmptyState
        icon={I.Building2}
        title="No organization selected"
        description={
          organizationError ??
          "Select an organization before opening the Command Center."
        }
      />
    );
  }

  if (dashboardQuery.isLoading) {
    return <DashboardSkeleton />;
  }

  if (dashboardQuery.isError || !data || !p) {
    return (
      <div className="card p-10 text-center">
        <I.AlertTriangle className="mx-auto text-[#b42318]" size={24} />
        <h2 className="font-semibold mt-4">Command Center unavailable</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {dashboardQuery.error instanceof Error
            ? dashboardQuery.error.message
            : "The live portfolio command-center data could not be loaded."}
        </p>
        <button
          type="button"
          onClick={() => void dashboardQuery.refetch()}
          className="btn-secondary mt-5"
        >
          <I.RefreshCw size={14} /> Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow="Executive operating view"
        title="Command Center"
        description="A live control surface for portfolio money, occupancy, operations and security."
        action={
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex rounded-xl border border-border bg-card p-1">
              {(["7D", "30D", "90D"] as Range[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setRange(item)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${range === item ? "bg-[#101828] text-white" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {item}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={refreshIntelligence}
              disabled={evaluate.isPending || dashboardQuery.isFetching}
              className="btn-primary disabled:opacity-50"
            >
              <I.RefreshCw
                size={14}
                className={
                  evaluate.isPending || dashboardQuery.isFetching
                    ? "animate-spin"
                    : ""
                }
              />
              <span className="hidden sm:inline">
                {evaluate.isPending ? "Evaluating…" : "Refresh intelligence"}
              </span>
            </button>
          </div>
        }
      />

      <WorkspaceScene role="landlord" />

      <section className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <Stat
          label="Portfolio health"
          value={`${Math.round(p.healthScore)}/100`}
          sub={p.grade.replaceAll("_", " ")}
          icon={I.Activity}
        />
        <Stat
          label="Rent collection"
          value={pct(p.collectionRate)}
          sub={`${money(p.outstandingRent)} outstanding`}
          icon={I.Wallet}
        />
        <Stat
          label="Occupancy"
          value={pct(occupancyRate)}
          sub={`${p.vacantUnits} vacant units`}
          icon={I.Building2}
        />
        <Stat
          label="Maintenance"
          value={`${p.maintenanceOpen}`}
          sub={`${p.urgentMaintenance} urgent`}
          icon={I.Wrench}
        />
        <Stat
          label="Security exposure"
          value={`${p.openIncidents + p.openSecurityEvents}`}
          sub={`${p.offlineCameras} camera(s) offline`}
          icon={I.Shield}
        />
      </section>

      <LandlordControlPanel
        organizationId={activeOrganizationId}
        organization={activeOrganization}
        refreshOrganization={refreshOrganizations}
      />

      <section className="grid xl:grid-cols-[1.35fr_.65fr] gap-6">
        <div className="card p-5">
          <SectionHeader
            title="Financial health"
            action={
              <Link
                href="/finance"
                className="text-xs font-semibold text-muted-foreground"
              >
                Open finance →
              </Link>
            }
          />
          <div className="grid sm:grid-cols-4 gap-4">
            <Metric label="Rent billed" value={money(p.rentBilled)} />
            <Metric label="Collected" value={money(p.rentCollected)} />
            <Metric label="Expenses" value={money(p.expenses)} />
            <Metric label="Net cash" value={money(netCash)} />
          </div>
          <div className="mt-6">
            <div className="flex justify-between text-xs mb-2">
              <span className="text-muted-foreground">
                Collection performance
              </span>
              <b>{pct(p.collectionRate)}</b>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div
                className={`h-2 rounded-full ${p.collectionRate >= 90 ? "bg-[var(--status-success-text)]" : p.collectionRate >= 75 ? "bg-[var(--status-attention-text)]" : "bg-[var(--status-blocked-text)]"}`}
                style={{
                  width: `${Math.min(100, Math.max(0, p.collectionRate))}%`,
                }}
              />
            </div>
          </div>
          <div className="mt-5 grid sm:grid-cols-3 gap-3 text-xs">
            <MiniSignal
              label="Outstanding rent"
              value={money(p.outstandingRent)}
              status={p.outstandingRent > 0 ? "NEEDS_ATTENTION" : "HEALTHY"}
            />
            <MiniSignal
              label="Critical incidents"
              value={String(p.criticalIncidents)}
              status={p.criticalIncidents > 0 ? "CRITICAL" : "NONE"}
            />
            <MiniSignal
              label="Access denials / 24h"
              value={String(p.accessDenied24h)}
              status={p.accessDenied24h > 10 ? "CRITICAL" : "INFO"}
            />
          </div>
        </div>

        <div className="card p-5">
          <SectionHeader
            title="Portfolio health score"
            action={
              <StatusBadge status={p.grade} domain="monitoring">
                {p.grade.replaceAll("_", " ")}
              </StatusBadge>
            }
          />
          <div className="flex items-center gap-5">
            <div
              className="relative w-28 h-28 rounded-full flex items-center justify-center"
              style={{
                background: `conic-gradient(#d97745 ${p.healthScore * 3.6}deg,#eef0f3 0deg)`,
              }}
            >
              <div className="w-20 h-20 bg-card rounded-full flex flex-col items-center justify-center">
                <span className="metric text-2xl font-semibold">
                  {Math.round(p.healthScore)}
                </span>
                <span className="text-[9px] text-muted-foreground">HEALTH</span>
              </div>
            </div>
            <div className="flex-1 space-y-3 text-xs">
              <ScoreRow
                label="Financial"
                score={Math.round(p.collectionRate)}
              />
              <ScoreRow label="Operational" score={Math.round(occupancyRate)} />
              <ScoreRow
                label="Security"
                score={Math.max(
                  0,
                  Math.min(
                    100,
                    100 - p.openSecurityEvents * 5 - p.offlineCameras * 8,
                  ),
                )}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="card p-5">
        <SectionHeader
          title="Portfolio → property drill-down"
          action={
            <Link href="/properties" className="text-xs font-semibold">
              View all properties →
            </Link>
          }
        />
        <div className="grid lg:grid-cols-[.8fr_1.2fr] gap-5">
          <div className="space-y-2">
            {data.properties.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#d0d5dd] p-8 text-center text-sm text-muted-foreground">
                No properties are available in this organization.
              </div>
            ) : (
              data.properties.map((item) => (
                <button
                  key={item.property._id}
                  type="button"
                  onClick={() => setSelectedPropertyId(item.property._id)}
                  className={`w-full text-left rounded-xl border p-4 transition ${selectedProperty?.property._id === item.property._id ? "border-[#101828] bg-muted" : "border-border hover:border-[#cfd4dc]"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-sm">
                        {item.property.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {item.property.code} · {propertyAddress(item)}
                      </div>
                    </div>
                    <StatusBadge status={item.health.grade} domain="monitoring">
                      {Math.round(item.health.score)} · {item.health.grade.replaceAll("_", " ")}
                    </StatusBadge>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-muted">
                    <div
                      className={`h-1.5 rounded-full ${healthBar(item.health.score)}`}
                      style={{
                        width: `${Math.min(100, Math.max(0, item.health.score))}%`,
                      }}
                    />
                  </div>
                </button>
              ))
            )}
          </div>

          {selectedProperty && (
            <PropertyDrilldown property={selectedProperty} />
          )}
        </div>
      </section>

      <section className="grid xl:grid-cols-[1.2fr_.8fr] gap-6">
        <div className="card p-5">
          <SectionHeader
            title="Landlord action queue"
            action={
              <Link href="/intelligence" className="text-xs font-semibold">
                Open intelligence →
              </Link>
            }
          />
          {actionQueue.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No property actions are currently being raised by the live
              intelligence service.
            </div>
          ) : (
            <div className="space-y-2">
              {actionQueue.slice(0, 8).map((action) => (
                <div
                  key={`${action.propertyId}-${action.code}`}
                  className="rounded-xl border border-border p-3 flex items-start gap-3"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#fff7ed] flex items-center justify-center shrink-0">
                    <I.AlertTriangle size={15} className="text-[#b54708]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={action.priority} domain="predictive">
                        {action.priority}
                      </StatusBadge>
                      <span className="font-medium text-sm">
                        {action.title}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {action.propertyName} · {action.reason}
                    </p>
                  </div>
                  <Link
                    href={`/properties/${action.propertyId}`}
                    className="text-xs font-semibold whitespace-nowrap"
                  >
                    Inspect →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <SectionHeader
            title="Security & CCTV posture"
            action={
              <Link href="/security" className="text-xs font-semibold">
                Open security →
              </Link>
            }
          />
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Open incidents" value={String(p.openIncidents)} />
            <Metric
              label="Security events"
              value={String(p.openSecurityEvents)}
            />
            <Metric label="Camera offline" value={String(p.offlineCameras)} />
            <Metric label="Access denials" value={String(p.accessDenied24h)} />
          </div>
          <div className="mt-5 rounded-xl bg-muted p-4">
            <div className="flex items-center gap-2 text-xs font-medium">
              <I.Camera size={14} /> Camera health requires attention when the
              live registry reports offline devices.
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              The portfolio contract exposes offline-camera count, not a
              fabricated camera denominator; open Security for the full camera
              registry and live/playback controls.
            </p>
          </div>
        </div>
      </section>

      <section className="card p-5">
        <SectionHeader
          title="Active alerts"
          action={
            <Link href="/intelligence" className="text-xs font-semibold">
              View intelligence →
            </Link>
          }
        />
        {data.activeAlerts.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No active alerts for this organization in the selected period.
          </div>
        ) : (
          <div className="space-y-2">
            {data.activeAlerts.map((alert) => (
              <div
                key={alert._id}
                className="rounded-xl border border-border p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={alert.severity} domain="predictive">
                        {alert.severity}
                      </StatusBadge>
                      <span className="font-semibold text-sm">
                        {alert.title}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {alert.code}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {alert.message}
                    </p>
                    <div className="text-[10px] text-muted-foreground mt-2">
                      Last detected{" "}
                      {new Date(alert.lastDetectedAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {alert.status === "OPEN" && (
                      <button
                        type="button"
                        disabled={updateAlert.isPending}
                        onClick={() =>
                          updateAlert.mutate({
                            id: alert._id,
                            input: { status: "ACKNOWLEDGED" },
                          })
                        }
                        className="btn-secondary text-xs"
                      >
                        Acknowledge
                      </button>
                    )}
                    {(alert.status === "OPEN" ||
                      alert.status === "ACKNOWLEDGED") && (
                      <button
                        type="button"
                        disabled={updateAlert.isPending}
                        onClick={() =>
                          updateAlert.mutate({
                            id: alert._id,
                            input: { status: "RESOLVED" },
                          })
                        }
                        className="btn-secondary text-xs"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-2">
        <I.CalendarDays size={13} /> Showing live organization data for{" "}
        {range.toLowerCase()} · Snapshot as of{" "}
        {new Date(data.asOf).toLocaleString()} · No dashboard demo data is used.
      </div>
    </div>
  );
}

function PropertyDrilldown({ property }: { property: CommandCenterProperty }) {
  const m = property.metrics;
  return (
    <div className="rounded-2xl border border-border bg-[#fbfcfd] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#d97745]">
            Selected property
          </div>
          <h3 className="text-lg font-semibold mt-1">
            {property.property.name}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {property.property.code} ·{" "}
            {property.property.propertyType.replaceAll("_", " ")}
          </p>
        </div>
        <StatusBadge status={property.health.grade} domain="monitoring">
          {Math.round(property.health.score)} ·{" "}
          {property.health.grade.replaceAll("_", " ")}
        </StatusBadge>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
        <Metric label="Occupancy" value={pct(m.occupancyRate)} />
        <Metric label="Collection" value={pct(m.collectionRate)} />
        <Metric label="Arrears" value={money(m.arrearsAmount)} />
        <Metric label="Open work" value={String(m.maintenanceOpen)} />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href={`/properties/${property.property._id}`}
          className="btn-primary"
        >
          <I.Building2 size={14} /> Property
        </Link>
        <Link href="/tenants" className="btn-secondary">
          <I.Users size={14} /> Tenants
        </Link>
        <Link href="/tenants?view=tenancies" className="btn-secondary">
          <I.FileText size={14} /> Tenancies
        </Link>
        <Link href="/finance" className="btn-secondary">
          <I.Wallet size={14} /> Finance
        </Link>
        <Link href="/maintenance" className="btn-secondary">
          <I.Wrench size={14} /> Maintenance
        </Link>
        <Link href="/security" className="btn-secondary">
          <I.Shield size={14} /> Security
        </Link>
      </div>
      <div className="mt-5 pt-4 border-t border-border text-xs text-muted-foreground flex items-center gap-2">
        <I.ChevronRight size={13} /> Property detail contains the live Building
        → Floor → Unit hierarchy and the next level of operational drill-down.
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="metric font-semibold mt-1 text-sm">{value}</div>
    </div>
  );
}

function MiniSignal({label,value,status}:{label:string;value:string;status:string}) {
  return (
    <div className="rounded-xl border border-border p-3 flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <StatusBadge status={status} domain="monitoring">{value} - {status.replaceAll("_", " ")}</StatusBadge>
    </div>
  );
}

function ScoreRow({ label, score }: { label: string; score: number }) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-muted-foreground">{label}</span>
        <b>{score}</b>
      </div>
      <div className="h-1.5 bg-muted rounded-full">
        <div
          className={`h-1.5 rounded-full ${healthBar(score)}`}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-20 bg-muted rounded-2xl" />
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-32 bg-muted rounded-2xl" />
        ))}
      </div>
      <div className="grid xl:grid-cols-2 gap-6">
        <div className="h-64 bg-muted rounded-2xl" />
        <div className="h-64 bg-muted rounded-2xl" />
      </div>
      <div className="h-96 bg-muted rounded-2xl" />
    </div>
  );
}
