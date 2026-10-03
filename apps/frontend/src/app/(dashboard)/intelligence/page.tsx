'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { StatusSelect,  StatusBadge,  PageTitle, Stat, SectionHeader, Badge, EmptyState } from '@/components/ui';
import * as I from '@/components/icons';
import { useOrganization } from '@/hooks/use-organization';
import {
  useCommandCenterQuery,
  useEvaluateIntelligenceMutation,
  useIntelligenceAlertsQuery,
  usePropertyHealthHistoryQuery,
  useUpdateIntelligenceAlertMutation,
} from '@/hooks/queries/use-command-center-queries';
import type { CommandCenterProperty } from '@/types/api';
import type { HealthHistoryPoint } from '@/lib/data/resource-types';

const ranges = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
] as const;

type RangeLabel = (typeof ranges)[number]['label'];

type Dimension = {
  score: number;
  weight: number;
  weightedScore: number;
  signals: string[];
};

type DimensionsMap = Record<string, Dimension | undefined>;

function money(value: number) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(value);
}

function pct(value: number) {
  return `${Math.round(value)}%`;
}



function dimensionScore(dimensions: DimensionsMap, key: string) {
  const value = dimensions[key];
  return typeof value?.score === 'number' ? value.score : 0;
}

function dimensionSignals(dimensions: DimensionsMap, key: string) {
  return dimensions[key]?.signals ?? [];
}

function periodDates(days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function Intelligence() {
  const { activeOrganizationId } = useOrganization();
  const [range, setRange] = useState<RangeLabel>('30D');
  const [propertyId, setPropertyId] = useState<string>('ALL');
  const [severity, setSeverity] = useState('ALL');

  const days = ranges.find((item) => item.label === range)?.days ?? 30;
  const dates = useMemo(() => periodDates(days), [days]);

  const dashboard = useCommandCenterQuery(
    activeOrganizationId,
    { from: dates.from, to: dates.to, ...(propertyId !== 'ALL' ? { propertyId } : {}) },
  );
  const alerts = useIntelligenceAlertsQuery(activeOrganizationId, {
    ...(propertyId !== 'ALL' ? { propertyId } : {}),
    ...(severity !== 'ALL' ? { severity } : {}),
    status: 'OPEN',
    limit: 50,
  });
  const selectedProperty =
    propertyId !== 'ALL'
      ? dashboard.data?.properties.find((item) => item.property._id === propertyId) ?? null
      : dashboard.data?.properties[0] ?? null;
  const history = usePropertyHealthHistoryQuery(
    activeOrganizationId,
    propertyId !== 'ALL' ? propertyId : selectedProperty?.property._id ?? null,
  );
  const evaluate = useEvaluateIntelligenceMutation(activeOrganizationId);
  const updateAlert = useUpdateIntelligenceAlertMutation(activeOrganizationId);

  const propertyActions = useMemo(() => {
    const source =
      propertyId === 'ALL'
        ? dashboard.data?.properties.flatMap((item) =>
            item.actions.map((action) => ({
              ...action,
              propertyName: item.property.name,
              propertyId: item.property._id,
            })),
          ) ?? []
        : selectedProperty?.actions.map((action) => ({
            ...action,
            propertyName: selectedProperty.property.name,
            propertyId: selectedProperty.property._id,
          })) ?? [];
    const rank = { CRITICAL: 3, HIGH: 2, MEDIUM: 1 } as const;
    return source.sort((a, b) => rank[b.priority] - rank[a.priority]);
  }, [dashboard.data, propertyId, selectedProperty]);

  const portfolio = dashboard.data?.portfolio;
  const dimensions: DimensionsMap =
    (selectedProperty?.health.dimensions as DimensionsMap | undefined) ?? {};
  const trendData = useMemo(() => {
    const points = [...(history.data ?? [])].reverse();
    return points.map((point: HealthHistoryPoint) => ({
      date: new Date(point.asOf).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      }),
      score: Math.round(point.score),
    }));
  }, [history.data]);

  if (!activeOrganizationId) {
    return (
      <EmptyState
        icon={I.BrainCircuit}
        title="No active organization"
        description="Select an organization before opening decision intelligence."
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageTitle
        eyebrow="Decision layer"
        title="Decision Intelligence"
        description="Turn portfolio signals into explainable decisions, prioritized actions and measurable property-health trends."
        action={
          <button
            type="button"
            disabled={evaluate.isPending}
            onClick={() =>
              evaluate.mutate({
                from: dates.from,
                to: dates.to,
                ...(propertyId !== 'ALL' ? { propertyId } : {}),
              })
            }
            className="btn-primary"
          >
            <I.RefreshCw size={15} className={evaluate.isPending ? 'animate-spin' : ''} />
            {evaluate.isPending ? 'Evaluating…' : 'Evaluate intelligence'}
          </button>
        }
      />

      <div className="card p-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 mr-2 text-xs font-semibold">
          <I.SlidersHorizontal size={14} /> Scope
        </div>
        <select
          value={propertyId}
          onChange={(event) => setPropertyId(event.target.value)}
          className="input max-w-[260px]"
        >
          <option value="ALL">All properties</option>
          {(dashboard.data?.properties ?? []).map((item) => (
            <option key={item.property._id} value={item.property._id}>
              {item.property.name}
            </option>
          ))}
        </select>
        <div className="flex rounded-xl bg-muted p-1">
          {ranges.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => setRange(item.label)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                range === item.label ? 'bg-card shadow-sm' : 'text-muted-foreground'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <StatusSelect domain="predictive"
          value={severity}
          onChange={(event) => setSeverity(event.target.value)}
          className="input max-w-[170px]"
        >
          <option value="ALL">All severities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </StatusSelect>
      </div>

      {dashboard.isLoading ? (
        <IntelligenceSkeleton />
      ) : dashboard.isError ? (
        <div className="card p-8 text-center">
          <I.AlertTriangle className="mx-auto" size={24} />
          <h2 className="font-semibold mt-3">Decision intelligence unavailable</h2>
          <p className="text-sm text-muted-foreground mt-1">
            The live command-center intelligence contract could not be loaded.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
            <Stat
              label="Portfolio health"
              value={portfolio ? `${Math.round(portfolio.healthScore)}` : '—'}
              {...(portfolio ? { sub: portfolio.grade.replaceAll('_', ' ') } : {})}
              icon={I.BrainCircuit}
            />
            <Stat
              label="Collection rate"
              value={portfolio ? pct(portfolio.collectionRate) : '—'}
              {...(portfolio
                ? { sub: `${money(portfolio.outstandingRent)} outstanding` }
                : {})}
              icon={I.CircleDollarSign}
            />
            <Stat
              label="Vacancy"
              value={
                portfolio
                  ? pct(portfolio.units ? (portfolio.vacantUnits / portfolio.units) * 100 : 0)
                  : '—'
              }
              {...(portfolio
                ? { sub: `${portfolio.vacantUnits} vacant unit(s)` }
                : {})}
              icon={I.Building2}
            />
            <Stat
              label="Money exposure"
              value={portfolio ? money(portfolio.outstandingRent) : '—'}
              {...(portfolio ? { sub: `${portfolio.urgentMaintenance} urgent jobs` } : {})}
              icon={I.Landmark}
            />
            <Stat
              label="Active signals"
              value={String(alerts.data?.length ?? 0)}
              sub={`${propertyActions.length} recommended action(s)`}
              icon={I.AlertTriangle}
            />
          </div>

          <div className="grid xl:grid-cols-[1.15fr_.85fr] gap-6">
            <div className="card p-5">
              <SectionHeader
                title={
                  selectedProperty
                    ? `${selectedProperty.property.name} health model`
                    : 'Portfolio health model'
                }
                {...(selectedProperty
                  ? {
                      action: (
                        <StatusBadge status={selectedProperty.health.grade} domain="monitoring">
                          {Math.round(selectedProperty.health.score)} ·{' '}
                          {selectedProperty.health.grade.replaceAll('_', ' ')}
                        </StatusBadge>
                      ),
                    }
                  : {})}
              />
              <div className="grid md:grid-cols-3 gap-3">
                <DimensionCard
                  label="Financial"
                  score={dimensionScore(dimensions, 'financial')}
                  weight="40%"
                  signals={dimensionSignals(dimensions, 'financial')}
                />
                <DimensionCard
                  label="Operational"
                  score={dimensionScore(dimensions, 'operational')}
                  weight="35%"
                  signals={dimensionSignals(dimensions, 'operational')}
                />
                <DimensionCard
                  label="Security"
                  score={dimensionScore(dimensions, 'security')}
                  weight="25%"
                  signals={dimensionSignals(dimensions, 'security')}
                />
              </div>
              {selectedProperty && selectedProperty.health.warningCodes.length > 0 && (
                <div className="mt-5 pt-4 border-t border-border">
                  <div className="text-xs font-semibold mb-2">Detected warning signals</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedProperty.health.warningCodes.map((code) => (
                      <Badge key={code} tone="orange">
                        {code.replaceAll('_', ' ')}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="card p-5">
              <SectionHeader
                title="Health trajectory"
                {...(history.isFetching
                  ? { action: <span className="text-[11px] text-muted-foreground">Updating…</span> }
                  : {})}
              />
              {trendData.length < 2 ? (
                <div className="h-[230px] flex items-center justify-center text-sm text-muted-foreground text-center px-5">
                  Not enough persisted health snapshots yet. Run an intelligence evaluation
                  to establish a historical baseline.
                </div>
              ) : (
                <div className="h-[230px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={trendData}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(value) => [`${value}`, 'Health score']} />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke="currentColor"
                        strokeWidth={2.5}
                        dot={{ r: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          <div className="grid xl:grid-cols-[1.2fr_.8fr] gap-6">
            <div className="card p-5">
              <SectionHeader
                title="Priority decisions"
                action={
                  <span className="text-[11px] text-muted-foreground">
                    Derived from live property signals
                  </span>
                }
              />
              {propertyActions.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No decision actions are currently being raised.
                </div>
              ) : (
                <div className="space-y-3">
                  {propertyActions.slice(0, 12).map((action) => (
                    <div
                      className="p-4 rounded-xl border border-border"
                      key={`${action.propertyId}-${action.code}`}
                    >
                      <div className="flex items-center gap-2">
                        <StatusBadge status={action.priority} domain="predictive">{action.priority}</StatusBadge>
                        <span className="font-medium text-sm">{action.title}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">
                        {action.propertyName} · {action.reason}
                      </p>
                      <Link
                        href={`/properties/${action.propertyId}`}
                        className="inline-flex mt-3 text-xs font-semibold"
                      >
                        Inspect property →
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card p-5">
              <SectionHeader title="Decision methodology" />
              <div className="space-y-3 text-sm">
                <MethodRow label="Financial weight" value="40%" />
                <MethodRow label="Operational weight" value="35%" />
                <MethodRow label="Security weight" value="25%" />
                <MethodRow label="Health grades" value="5 tiers" />
                <MethodRow label="Explainability" value="Signals + thresholds" />
              </div>
              <div className="mt-5 rounded-xl bg-muted p-4 text-xs text-muted-foreground leading-5">
                The intelligence layer is advisory. It observes authoritative finance,
                property, maintenance and security data; it does not directly mutate the
                financial ledger or bypass approval controls.
              </div>
            </div>
          </div>

          <div className="card p-5">
            <SectionHeader
              title="Live intelligence alerts"
              action={
                <span className="text-[11px] text-muted-foreground">Open signals only</span>
              }
            />
            {alerts.isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading alerts…</div>
            ) : alerts.data?.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No open intelligence alerts match this scope.
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.data?.map((alert) => (
                  <div
                    key={alert._id}
                    className="rounded-xl border border-border p-4 flex items-start gap-3"
                  >
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={alert.severity} domain="predictive">{alert.severity}</StatusBadge>
                        <span className="font-semibold text-sm">{alert.title}</span>
                        <span className="text-[10px] text-muted-foreground">{alert.code}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">{alert.message}</p>
                      <div className="text-[10px] text-muted-foreground mt-2">
                        Observed {alert.observedValue ?? '—'} · threshold{' '}
                        {alert.thresholdValue ?? '—'} ·{' '}
                        {new Date(alert.lastDetectedAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {alert.status === 'OPEN' && (
                        <button
                          type="button"
                          disabled={updateAlert.isPending}
                          onClick={() =>
                            updateAlert.mutate({
                              id: alert._id,
                              input: { status: 'ACKNOWLEDGED' },
                            })
                          }
                          className="btn-secondary text-xs"
                        >
                          Acknowledge
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={updateAlert.isPending}
                        onClick={() =>
                          updateAlert.mutate({
                            id: alert._id,
                            input: { status: 'RESOLVED' },
                          })
                        }
                        className="btn-secondary text-xs"
                      >
                        Resolve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="text-[11px] text-muted-foreground flex items-center gap-2">
            <I.CalendarDays size={13} /> Live intelligence scope: {range} ·{' '}
            {selectedProperty ? selectedProperty.property.name : 'all properties'} · Snapshot{' '}
            {dashboard.data ? new Date(dashboard.data.asOf).toLocaleString() : '—'}
          </div>
        </>
      )}
    </div>
  );
}

function DimensionCard({
  label,
  score,
  weight,
  signals,
}: {
  label: string;
  score: number;
  weight: string;
  signals: string[];
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">{label}</span>
        <Badge tone={score >= 75 ? 'green' : score >= 60 ? 'orange' : 'red'}>
          {Math.round(score)}
        </Badge>
      </div>
      <div className="text-[10px] text-muted-foreground mt-1">Weight {weight}</div>
      <div className="mt-3 h-1.5 rounded-full bg-muted">
        <div
          className="h-1.5 rounded-full bg-[#344054]"
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
      <div className="mt-3 space-y-1">
        {signals.map((signal) => (
          <div key={signal} className="text-[10px] text-muted-foreground">
            • {signal}
          </div>
        ))}
      </div>
    </div>
  );
}

function MethodRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <b className="text-sm">{value}</b>
    </div>
  );
}

function IntelligenceSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-32 bg-muted rounded-2xl" />
        ))}
      </div>
      <div className="grid xl:grid-cols-2 gap-6">
        <div className="h-72 bg-muted rounded-2xl" />
        <div className="h-72 bg-muted rounded-2xl" />
      </div>
      <div className="h-96 bg-muted rounded-2xl" />
    </div>
  );
}