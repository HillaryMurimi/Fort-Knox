'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, CircleAlert, Play, RotateCcw, ShieldCheck, XCircle } from 'lucide-react';
import { demoCertificationRoles, runDemoCertification, type CertificationReport, type CertificationStatus } from '@/lib/demo/demo-certification';
import { DEMO_ROLE_STORAGE_KEY, DEV_DEMO_MODE, getDemoRole, type DemoRole } from '@/lib/demo/demo-config';

const routes = [
  ['/dashboard', 'Dashboard'],
  ['/properties', 'Properties'],
  ['/buildings/demo-building-1', 'Building detail'],
  ['/floors/demo-floor-1', 'Floor detail'],
  ['/units/demo-unit-101', 'Unit passport'],
  ['/tenants', 'Tenants'],
  ['/tenancies/demo-tenancy-1', 'Tenancy detail'],
  ['/finance', 'Finance'],
  ['/maintenance', 'Maintenance'],
  ['/documents', 'Documents'],
  ['/security', 'Security'],
  ['/intelligence', 'Intelligence'],
  ['/decision-automation', 'Decision automation'],
  ['/predictive-intelligence', 'Predictive intelligence'],
  ['/model-serving', 'Model serving'],
  ['/billing', 'Billing'],
  ['/integrations', 'Integrations'],
  ['/audit', 'Audit'],
] as const;

function setRole(role: DemoRole) {
  window.localStorage.setItem(DEMO_ROLE_STORAGE_KEY, role);
  window.location.reload();
}

function statusIcon(status: CertificationStatus) {
  if (status === 'PASS') return <CheckCircle2 className="h-4 w-4" />;
  if (status === 'WARN') return <CircleAlert className="h-4 w-4" />;
  return <XCircle className="h-4 w-4" />;
}

export default function DemoCertificationPage() {
  const [role, setCurrentRole] = useState<DemoRole>('LANDLORD');

  useEffect(() => {
    setCurrentRole(getDemoRole());
  }, []);
  const [report, setReport] = useState<CertificationReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roles = useMemo(() => demoCertificationRoles(), []);

  const execute = async () => {
    setRunning(true);
    setError(null);
    try {
      setRole(role);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to switch role.');
      setRunning(false);
    }
  };

  const runCurrentRole = async () => {
    setRunning(true);
    setError(null);
    try {
      setReport(await runDemoCertification(role));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Certification failed.');
    } finally {
      setRunning(false);
    }
  };

  const passed = report?.checks.filter((check) => check.status === 'PASS').length ?? 0;
  const failed = report?.checks.filter((check) => check.status === 'FAIL').length ?? 0;

  if (!DEV_DEMO_MODE) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
        <div className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-card/[0.06] p-8 text-center shadow-2xl backdrop-blur-xl">
          <ShieldCheck className="mx-auto h-10 w-10 text-orange-300" />
          <h1 className="mt-4 text-2xl font-semibold">Demo certification is disabled</h1>
          <p className="mt-2 text-sm text-muted-foreground">Set NEXT_PUBLIC_DEV_DEMO_MODE=true in the development environment to use Phase 21 certification.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl border border-white/10 bg-card/[0.06] p-6 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1 text-xs font-medium text-orange-200">
                <ShieldCheck className="h-3.5 w-3.5" /> Phase 21 · Demo Certification
              </div>
              <h1 className="text-3xl font-semibold tracking-tight">Role-by-Role UI Certification</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                Validate role-scoped demo data first, then traverse the actual UI surface for the selected identity.
                Production RBAC and ABAC are not modified by this harness.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Current certification role</div>
              <div className="mt-1 font-semibold">{role}</div>
            </div>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((candidate) => (
            <button
              key={candidate}
              type="button"
              onClick={() => setCurrentRole(candidate)}
              className={`rounded-2xl border p-4 text-left transition ${candidate === role ? 'border-orange-300/40 bg-orange-300/10' : 'border-white/10 bg-card/[0.04] hover:bg-card/[0.08]'}`}
            >
              <div className="text-sm font-semibold">{candidate}</div>
              <div className="mt-1 text-xs text-muted-foreground">Switch global development identity</div>
            </button>
          ))}
        </section>

        <section className="flex flex-wrap gap-3">
          <button type="button" onClick={execute} disabled={running} className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            <Play className="h-4 w-4" /> Switch role & reload
          </button>
          <button type="button" onClick={runCurrentRole} disabled={running} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-card/[0.06] px-4 py-2.5 text-sm font-semibold hover:bg-card/[0.1] disabled:opacity-50">
            <RotateCcw className="h-4 w-4" /> {running ? 'Running…' : 'Run data certification'}
          </button>
        </section>

        {error && <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">{error}</div>}

        {report && (
          <section className="rounded-3xl border border-white/10 bg-card/[0.04] p-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Data certification: {report.role}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{passed} passed · {failed} failed</p>
              </div>
              <div className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">{new Date(report.finishedAt).toLocaleTimeString()}</div>
            </div>
            <div className="grid gap-2">
              {report.checks.map((check) => (
                <div key={check.id} className="flex items-start gap-3 rounded-xl border border-white/5 bg-black/10 p-3">
                  <div className={check.status === 'PASS' ? 'text-emerald-400' : check.status === 'WARN' ? 'text-amber-400' : 'text-red-400'}>{statusIcon(check.status)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <span>{check.label}</span>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{check.area}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{check.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-3xl border border-white/10 bg-card/[0.04] p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Manual traversal surface</h2>
            <p className="mt-1 text-sm text-muted-foreground">Use these links after the data checks pass. Certification is not complete until the pages themselves are traversed.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {routes.map(([href, label]) => (
              <Link key={href} href={href} className="rounded-xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-slate-200 transition hover:border-orange-300/30 hover:bg-orange-300/10">
                {label}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
