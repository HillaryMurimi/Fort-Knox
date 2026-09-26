'use client';

import { useState } from 'react';
import type { ElementType, ReactNode } from 'react';

import * as I from '@/components/icons';
import {
  Badge,
  EmptyState,
  PageTitle,
  SectionHeader,
  Stat,
} from '@/components/ui';
import { useOrganization } from '@/hooks/use-organization';
import {
  useBootstrapDecisionAutomationMutation,
  useDecisionAutomationActionsQuery,
  useDecisionAutomationOverviewQuery,
  useDecisionAutomationPolicyQuery,
  useEvaluateDecisionAutomationMutation,
  useTenantArrearsRisksQuery,
  useUpdateDecisionAutomationPolicyMutation,
  useUpdateLandlordActionMutation,
  useVacancyForecastsQuery,
} from '@/hooks/queries/use-decision-automation-queries';
import { usePropertiesQuery } from '@/hooks/queries/use-property-queries';
import type { DecisionAutomationPolicyInput } from '@/lib/data/decision-automation';
import type {
  DecisionAutomationPolicy,
  LandlordAction,
} from '@/lib/data/resource-types';

/**
 * Safely format a monetary value.
 *
 * API/domain data can occasionally contain missing values while old records
 * are being migrated. Presentation helpers must therefore never allow a
 * malformed record to crash the entire command-center page.
 */
const money = (n?: number | null): string => {
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    return '—';
  }

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(n);
};

/**
 * Safely format a fractional value as a percentage.
 *
 * Example:
 * 0.87 -> 87%
 */
const pct = (n?: number | null): string => {
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    return '—';
  }

  return `${Math.round(n * 100)}%`;
};

/**
 * Converts enum-style identifiers into readable UI text.
 *
 * Examples:
 * IN_PROGRESS -> In Progress
 * ARREARS_RISK -> Arrears Risk
 *
 * Missing values intentionally degrade to an em dash instead of throwing.
 */
const pretty = (s?: string | null): string => {
  if (!s || typeof s !== 'string') {
    return '—';
  }

  return s
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase());
};

/**
 * Safely maps operational statuses/priorities to Badge tones.
 *
 * Missing or unknown values use a neutral tone rather than assuming a
 * potentially misleading severity.
 */
const tone = (
  s?: string | null,
): 'neutral' | 'green' | 'orange' | 'red' | 'blue' => {
  if (!s || typeof s !== 'string') {
    return 'neutral';
  }

  const normalized = s.toUpperCase();

  if (['CRITICAL', 'HIGH'].includes(normalized)) {
    return 'red';
  }

  if (['MEDIUM', 'MODERATE'].includes(normalized)) {
    return 'orange';
  }

  if (['LOW', 'OPEN'].includes(normalized)) {
    return 'blue';
  }

  return 'green';
};

/**
 * Safely formats ISO/date-compatible API values.
 *
 * Invalid dates also degrade gracefully instead of rendering "Invalid Date".
 */
const fmtDate = (s?: string | null): string => {
  if (!s) {
    return '—';
  }

  const date = new Date(s);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

/**
 * Safely formats arbitrary finite numbers.
 */
const number = (
  value?: number | null,
  maximumFractionDigits = 0,
): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }

  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits,
  }).format(value);
};

/**
 * Safely formats a number followed by a suffix.
 */
const numberWithSuffix = (
  value: number | null | undefined,
  suffix: string,
  maximumFractionDigits = 0,
): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }

  return `${number(value, maximumFractionDigits)}${suffix}`;
};

type ActionProps = {
  a: LandlordAction;
  onUpdate: (
    status: 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'DISMISSED',
  ) => void;
  pending: boolean;
};

function Action({ a, onUpdate, pending }: ActionProps) {
  const actionStatus = a.status ?? '';

  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="flex justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={tone(a.priority)}>{pretty(a.priority)}</Badge>

            <Badge>{pretty(a.source)}</Badge>

            {a.mlInfluenced && <Badge tone="blue">ML influenced</Badge>}
          </div>

          <h3 className="mt-2 font-semibold">{a.title || 'Untitled action'}</h3>

          <p className="mt-1 text-sm text-muted-foreground">
            {a.reason || 'No decision rationale is available.'}
          </p>
        </div>

        <Badge tone={tone(a.status)}>{pretty(a.status)}</Badge>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Metric label="Money at risk" value={money(a.moneyAtRisk)} />

        <Metric
          label="Urgency"
          value={
            typeof a.urgencyScore === 'number' &&
            Number.isFinite(a.urgencyScore)
              ? `${Math.round(a.urgencyScore)}/100`
              : '—'
          }
        />

        <Metric label="Confidence" value={pct(a.confidence)} />

        <Metric
          label="Escalation"
          value={
            a.escalationLevel !== null &&
            a.escalationLevel !== undefined
              ? String(a.escalationLevel)
              : '—'
          }
        />
      </div>

      <div className="mt-4 rounded-xl bg-muted p-3 text-sm">
        <b>Recommended:</b>{' '}
        {a.recommendedAction || 'No recommendation is currently available.'}
      </div>

      {!['RESOLVED', 'DISMISSED'].includes(actionStatus) && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="btn-secondary"
            disabled={pending}
            onClick={() => onUpdate('ACKNOWLEDGED')}
            type="button"
          >
            Acknowledge
          </button>

          <button
            className="btn-secondary"
            disabled={pending}
            onClick={() => onUpdate('IN_PROGRESS')}
            type="button"
          >
            Start action
          </button>

          <button
            className="btn-primary"
            disabled={pending}
            onClick={() => onUpdate('RESOLVED')}
            type="button"
          >
            Resolve
          </button>

          <button
            className="btn-secondary"
            disabled={pending}
            onClick={() => onUpdate('DISMISSED')}
            type="button"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="mt-3 text-[11px] text-muted-foreground">
        Detected {fmtDate(a.detectedAt)} ·{' '}
        {a.modelVersion || 'Rule-based model'}
        {a.dueAt ? ` · Due ${fmtDate(a.dueAt)}` : ''}
      </div>
    </div>
  );
}

type MetricProps = {
  label: string;
  value: string;
};

function Metric({ label, value }: MetricProps) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>

      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

type BoundaryProps = {
  icon: ElementType;
  title: string;
  text: string;
};

function Boundary({ icon: Icon, title, text }: BoundaryProps) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
        <Icon size={17} />
      </div>

      <div className="mt-3 text-sm font-semibold">{title}</div>

      <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
    </div>
  );
}

type PolicyEditorProps = {
  p: DecisionAutomationPolicy | null;
  onSave: (input: DecisionAutomationPolicyInput) => void;
  pending: boolean;
};

function PolicyEditor({ p, onSave, pending }: PolicyEditorProps) {
  const [enabled, setEnabled] = useState(p?.enabled ?? true);

  const [interval, setInterval] = useState(
    String(p?.evaluationIntervalMinutes ?? 60),
  );

  const [escalation, setEscalation] = useState(
    String(p?.escalationAfterMinutes ?? 120),
  );

  const [priority, setPriority] =
    useState<DecisionAutomationPolicy['notifyPriority']>(
      p?.notifyPriority ?? 'HIGH',
    );

  const [horizon, setHorizon] = useState(
    String(p?.forecastHorizonDays ?? 30),
  );

  const [max, setMax] = useState(
    String(p?.maxNotificationsPerRun ?? 20),
  );

  const handleSave = () => {
    onSave({
      enabled,
      evaluationIntervalMinutes: Number(interval),
      escalationAfterMinutes: Number(escalation),
      notifyPriority: priority,
      forecastHorizonDays: Number(horizon),
      maxNotificationsPerRun: Number(max),
    });
  };

  return (
    <div className="grid max-w-3xl gap-4 md:grid-cols-2">
      <Field label="Automation">
        <select
          className="input"
          value={String(enabled)}
          onChange={(e) => setEnabled(e.target.value === 'true')}
        >
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </select>
      </Field>

      <Field label="Evaluation interval (minutes)">
        <input
          className="input"
          type="number"
          min="5"
          max="10080"
          value={interval}
          onChange={(e) => setInterval(e.target.value)}
        />
      </Field>

      <Field label="Escalation after (minutes)">
        <input
          className="input"
          type="number"
          min="15"
          max="43200"
          value={escalation}
          onChange={(e) => setEscalation(e.target.value)}
        />
      </Field>

      <Field label="Minimum notification priority">
        <select
          className="input"
          value={priority}
          onChange={(e) =>
            setPriority(
              e.target.value as DecisionAutomationPolicy['notifyPriority'],
            )
          }
        >
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
      </Field>

      <Field label="Forecast horizon (days)">
        <input
          className="input"
          type="number"
          min="7"
          max="365"
          value={horizon}
          onChange={(e) => setHorizon(e.target.value)}
        />
      </Field>

      <Field label="Max notifications / run">
        <input
          className="input"
          type="number"
          min="1"
          max="100"
          value={max}
          onChange={(e) => setMax(e.target.value)}
        />
      </Field>

      <div className="flex items-center justify-between pt-2 md:col-span-2">
        <span className="text-[11px] text-muted-foreground">
          Last scheduled: {fmtDate(p?.lastScheduledAt)}
        </span>

        <button
          className="btn-primary"
          disabled={pending}
          onClick={handleSave}
          type="button"
        >
          {pending ? 'Saving…' : 'Save policy'}
        </button>
      </div>
    </div>
  );
}

type FieldProps = {
  label: string;
  children: ReactNode;
};

function Field({ label, children }: FieldProps) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export default function DecisionAutomationPage() {
  const { activeOrganizationId } = useOrganization();

  const [propertyId, setPropertyId] = useState('ALL');
  const [status, setStatus] = useState('OPEN');
  const [priority, setPriority] = useState('ALL');
  const [grade, setGrade] = useState('ALL');

  const [tab, setTab] = useState<
    'actions' | 'risks' | 'vacancies' | 'policy'
  >('actions');

  const scope = propertyId === 'ALL' ? {} : { propertyId };

  const propertiesQuery = usePropertiesQuery(activeOrganizationId);

  const overview = useDecisionAutomationOverviewQuery(
    activeOrganizationId,
    scope,
  );

  const policy = useDecisionAutomationPolicyQuery(activeOrganizationId);

  const actions = useDecisionAutomationActionsQuery(activeOrganizationId, {
    ...scope,
    ...(status !== 'ALL' ? { status } : {}),
    ...(priority !== 'ALL' ? { priority } : {}),
    limit: 100,
  });

  const risks = useTenantArrearsRisksQuery(activeOrganizationId, {
    ...scope,
    ...(grade !== 'ALL' ? { grade } : {}),
    limit: 100,
  });

  const vacancies = useVacancyForecastsQuery(activeOrganizationId, {
    ...scope,
    limit: 100,
  });

  const evaluate =
    useEvaluateDecisionAutomationMutation(activeOrganizationId);

  const bootstrap =
    useBootstrapDecisionAutomationMutation(activeOrganizationId);

  const savePolicy =
    useUpdateDecisionAutomationPolicyMutation(activeOrganizationId);

  const updateAction =
    useUpdateLandlordActionMutation(activeOrganizationId);

  if (!activeOrganizationId) {
    return (
      <EmptyState
        icon={I.Workflow}
        title="No active organization"
        description="Select an organization before opening decision automation."
      />
    );
  }

  const p = policy.data;
  const properties = propertiesQuery.data ?? [];

  const portfolio = overview.data?.portfolio;
  const trendVelocity = overview.data?.trendVelocity;

  return (
    <div className="space-y-5">
      <PageTitle
        eyebrow="Governed execution"
        title="Decision Automation"
        description="Turn explainable intelligence into controlled landlord actions, escalation workflows and governed notifications."
        action={
          <div className="flex gap-2">
            <button
              className="btn-secondary"
              disabled={bootstrap.isPending}
              onClick={() => bootstrap.mutate()}
              type="button"
            >
              {bootstrap.isPending ? 'Bootstrapping…' : 'Bootstrap'}
            </button>

            <button
              className="btn-primary"
              disabled={evaluate.isPending}
              onClick={() => evaluate.mutate(scope)}
              type="button"
            >
              <I.RefreshCw
                size={15}
                className={evaluate.isPending ? 'animate-spin' : ''}
              />

              {evaluate.isPending ? 'Evaluating…' : 'Evaluate now'}
            </button>
          </div>
        }
      />

      <div className="card flex flex-wrap items-center gap-2 p-3">
        <span className="flex items-center gap-2 text-xs font-semibold">
          <I.SlidersHorizontal size={14} />
          Scope
        </span>

        <select
          className="input max-w-[280px]"
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
        >
          <option value="ALL">All properties</option>

          {properties.map((property) => (
            <option key={property._id} value={property._id}>
              {property.name || 'Unnamed property'}
            </option>
          ))}
        </select>

        <span className="ml-auto text-[11px] text-muted-foreground">
          {overview.data?.asOf
            ? `As of ${fmtDate(overview.data.asOf)}`
            : 'Live evaluation data'}
        </span>
      </div>

      {overview.isLoading ? (
        <div className="card h-40 animate-pulse" />
      ) : overview.isError ? (
        <div className="card p-8 text-center">
          <I.AlertTriangle className="mx-auto" />

          <b className="mt-3 block">Decision automation unavailable</b>

          <p className="mt-1 text-sm text-muted-foreground">
            The automation overview could not be loaded. Try again shortly.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
            <Stat
              label="Open actions"
              value={number(portfolio?.openActions)}
              sub={`${number(portfolio?.criticalActions)} critical`}
              icon={I.Workflow}
            />

            <Stat
              label="Money at risk"
              value={money(portfolio?.totalMoneyAtRisk)}
              sub="Active action exposure"
              icon={I.Landmark}
            />

            <Stat
              label="High-risk tenants"
              value={number(portfolio?.highRiskTenants)}
              sub="Arrears risk"
              icon={I.Users}
            />

            <Stat
              label="Prolonged vacancies"
              value={number(portfolio?.prolongedVacancies)}
              sub="60+ day forecast"
              icon={I.Building2}
            />

            <Stat
              label="Health velocity"
              value={number(trendVelocity?.healthScoreVelocity, 1)}
              sub="Score points / day"
              icon={I.TrendingDown}
            />

            <Stat
              label="Negative velocity"
              value={number(trendVelocity?.propertiesWithNegativeVelocity)}
              sub="Properties deteriorating"
              icon={I.AlertTriangle}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
            <div className="card p-5">
              <SectionHeader title="Automation boundary" />

              <div className="grid gap-3 md:grid-cols-3">
                <Boundary
                  icon={I.BrainCircuit}
                  title="Intelligence"
                  text="Detects risks, forecasts and portfolio signals."
                />

                <Boundary
                  icon={I.Workflow}
                  title="Automation"
                  text="Ranks actions, escalates and notifies within policy."
                />

                <Boundary
                  icon={I.ShieldCheck}
                  title="Human control"
                  text="Financial approvals and ledger mutations remain authoritative."
                />
              </div>

              <div className="mt-4 rounded-xl border border-[#fed7aa] bg-[#fff7ed] p-3 text-sm">
                Automation coordinates decisions; it does not create, approve,
                pay or reverse financial records.
              </div>
            </div>

            <div className="card p-5">
              <SectionHeader
                title="Policy status"
                action={
                  <Badge tone={p?.enabled ? 'green' : 'orange'}>
                    {p?.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                }
              />

              <div className="grid grid-cols-2 gap-4">
                <Metric
                  label="Interval"
                  value={
                    p
                      ? numberWithSuffix(
                          p.evaluationIntervalMinutes,
                          ' min',
                        )
                      : '—'
                  }
                />

                <Metric
                  label="Escalation"
                  value={
                    p
                      ? numberWithSuffix(
                          p.escalationAfterMinutes,
                          ' min',
                        )
                      : '—'
                  }
                />

                <Metric
                  label="Notify priority"
                  value={p ? pretty(p.notifyPriority) : '—'}
                />

                <Metric
                  label="Forecast horizon"
                  value={
                    p
                      ? numberWithSuffix(
                          p.forecastHorizonDays,
                          ' days',
                        )
                      : '—'
                  }
                />

                <Metric
                  label="Notifications/run"
                  value={p ? number(p.maxNotificationsPerRun) : '—'}
                />

                <Metric
                  label="Last evaluated"
                  value={fmtDate(p?.lastEvaluatedAt)}
                />
              </div>

              {!p && (
                <button
                  className="btn-secondary mt-4"
                  onClick={() => bootstrap.mutate()}
                  disabled={bootstrap.isPending}
                  type="button"
                >
                  {bootstrap.isPending
                    ? 'Creating policy…'
                    : 'Create default policy'}
                </button>
              )}
            </div>
          </div>

          <div className="card p-5">
            <div className="flex gap-2 border-b border-border pb-3">
              {(
                ['actions', 'risks', 'vacancies', 'policy'] as const
              ).map((x) => (
                <button
                  key={x}
                  className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                    tab === x
                      ? 'bg-[#101828] text-white'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                  onClick={() => setTab(x)}
                  type="button"
                >
                  {pretty(x)}
                </button>
              ))}
            </div>

            {tab === 'actions' && (
              <div className="pt-4">
                <div className="mb-4 flex flex-wrap gap-2">
                  <select
                    className="input max-w-[180px]"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="ALL">All statuses</option>
                    <option value="OPEN">Open</option>
                    <option value="ACKNOWLEDGED">Acknowledged</option>
                    <option value="IN_PROGRESS">In progress</option>
                    <option value="RESOLVED">Resolved</option>
                    <option value="DISMISSED">Dismissed</option>
                  </select>

                  <select
                    className="input max-w-[180px]"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    <option value="ALL">All priorities</option>
                    <option value="CRITICAL">Critical</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                </div>

                {actions.isLoading ? (
                  <div className="h-32 animate-pulse rounded-xl bg-muted" />
                ) : actions.isError ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    Decision actions could not be loaded.
                  </div>
                ) : actions.data?.length ? (
                  <div className="space-y-3">
                    {actions.data.map((a) => (
                      <Action
                        key={a._id}
                        a={a}
                        pending={updateAction.isPending}
                        onUpdate={(nextStatus) =>
                          updateAction.mutate({
                            actionId: a._id,
                            input: {
                              status: nextStatus,
                            },
                          })
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    No actions match the current filters.
                  </div>
                )}
              </div>
            )}

            {tab === 'risks' && (
              <div className="pt-4">
                <select
                  className="input mb-4 max-w-[180px]"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                >
                  <option value="ALL">All risk grades</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MODERATE">Moderate</option>
                  <option value="LOW">Low</option>
                </select>

                {risks.isLoading ? (
                  <div className="h-32 animate-pulse rounded-xl bg-muted" />
                ) : risks.isError ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    Tenant risk observations could not be loaded.
                  </div>
                ) : risks.data?.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
                          <th className="py-3">Tenant</th>
                          <th>Risk</th>
                          <th>Probability</th>
                          <th>Outstanding</th>
                          <th>Past due</th>
                          <th>Confidence</th>
                        </tr>
                      </thead>

                      <tbody>
                        {risks.data.map((r) => (
                          <tr key={r._id} className="border-b">
                            <td className="py-3 font-medium">
                              {r.tenantId || '—'}
                            </td>

                            <td>
                              <Badge tone={tone(r.grade)}>
                                {pretty(r.grade)}
                              </Badge>
                            </td>

                            <td>{pct(r.probability)}</td>

                            <td>{money(r.outstandingAmount)}</td>

                            <td>
                              {typeof r.daysPastDue === 'number' &&
                              Number.isFinite(r.daysPastDue)
                                ? `${Math.round(r.daysPastDue)}d`
                                : '—'}
                            </td>

                            <td>{pct(r.confidence)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    No tenant risk observations available.
                  </div>
                )}
              </div>
            )}

            {tab === 'vacancies' && (
              <div className="pt-4">
                {vacancies.isLoading ? (
                  <div className="h-32 animate-pulse rounded-xl bg-muted" />
                ) : vacancies.isError ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    Vacancy forecasts could not be loaded.
                  </div>
                ) : vacancies.data?.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
                          <th className="py-3">Unit</th>
                          <th>Current vacancy</th>
                          <th>Predicted lease</th>
                          <th>Revenue at risk</th>
                          <th>Confidence</th>
                        </tr>
                      </thead>

                      <tbody>
                        {vacancies.data.map((v) => (
                          <tr key={v._id} className="border-b">
                            <td className="py-3 font-medium">
                              {v.unitId || '—'}
                            </td>

                            <td>
                              {numberWithSuffix(
                                v.currentVacancyDays,
                                'd',
                              )}
                            </td>

                            <td>
                              {numberWithSuffix(
                                v.predictedDaysToLease,
                                'd',
                              )}
                            </td>

                            <td>{money(v.revenueAtRisk)}</td>

                            <td>{pct(v.confidence)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    No vacancy forecasts available.
                  </div>
                )}
              </div>
            )}

            {tab === 'policy' && (
              <div className="pt-4">
                <PolicyEditor
                  p={p ?? null}
                  pending={savePolicy.isPending}
                  onSave={(input) => savePolicy.mutate(input)}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}