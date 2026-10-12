"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { portfolioOnboardingClient as client } from "@/lib/data/portfolio-onboarding";
import { Alert } from "@/components/ui";

export function FirstPortfolio({
  dashboardLoaded = false,
}: {
  dashboardLoaded?: boolean;
}) {
  const auth = useAuth(),
    { activeOrganizationId: org, activeOrganization } = useOrganization(),
    qc = useQueryClient(),
    recording = useRef("");
  const owner = auth.memberships.some(
    (m) =>
      m.organizationId === org &&
      m.roles.includes("LANDLORD") &&
      m.scope.allProperties,
  );
  const enabled =
    !!org &&
    owner &&
    !auth.isDevMode &&
    activeOrganization?.onboarding?.state === "ACTIVE";
  const key = ["portfolio-onboarding", org, auth.user?._id];
  const query = useQuery({
    queryKey: key,
    queryFn: () => client.progress(org!),
    enabled,
  });
  const data = query.data;
  useEffect(() => {
    if (
      !enabled ||
      !dashboardLoaded ||
      !data ||
      !org ||
      !data.facts.properties ||
      !data.facts.units ||
      data.milestones.firstDashboardAt ||
      recording.current === org
    )
      return;
    recording.current = org;
    void client
      .dashboardVisited(org)
      .then(() =>
        qc.invalidateQueries({
          queryKey: ["portfolio-onboarding", org, auth.user?._id],
        }),
      )
      .catch(() => {
        recording.current = "";
      });
  }, [enabled, dashboardLoaded, data, org, qc, auth.user?._id]);
  if (!enabled) return null;
  if (query.error)
    return (
      <Alert>
        Setup progress could not be loaded.{" "}
        <Link href="/get-started" className="underline">
          Resume setup
        </Link>
      </Alert>
    );
  if (!data) return <p role="status">Loading your saved portfolio…</p>;
  const f = data.facts,
    money =
      f.knownMonthlyRentMinor === null
        ? "Not available"
        : new Intl.NumberFormat("en-KE", {
            style: "currency",
            currency: f.currency,
          }).format(f.knownMonthlyRentMinor / 100);
  return (
    <section
      className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-5"
      aria-labelledby="first-portfolio-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Your saved portfolio
          </p>
          <h2
            id="first-portfolio-title"
            className="mt-2 text-2xl font-semibold"
          >
            {f.units
              ? "Your property workspace is taking shape"
              : "Welcome to Dapinni"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {f.units
              ? "These figures come from your saved properties, units and current tenancies."
              : "Your workspace is ready. Let's set up your first property."}
          </p>
        </div>
        <Link href="/get-started" className="btn-primary">
          {data.complete ? "Review setup" : "Continue setup"}
        </Link>
      </div>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Properties", f.properties],
          ["Total units", f.units],
          ["Occupied", f.occupied],
          ["Vacant", f.vacant],
          ["Known monthly rent", money],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border p-4">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-2 text-xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted-foreground">
        {f.rentCoverageComplete
          ? "Rent covers the saved occupied units."
          : "Monthly rent is limited to saved current tenancies; complete tenancy records to cover every occupied unit."}{" "}
        {f.pendingTenantActivations} tenant contacts await activation or
        verification.
      </p>
      <div>
        <label className="text-sm font-semibold" htmlFor="portfolio-progress">
          Essential setup · {data.percent}%
        </label>
        <progress
          id="portfolio-progress"
          value={data.percent}
          max={100}
          className="mt-2 w-full accent-emerald-600"
        />
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {data.checks.map((check) => (
            <li key={check.key} className="text-sm">
              <span aria-label={check.done ? "Complete" : "Pending"}>
                {check.done ? "✓" : "○"}
              </span>{" "}
              <Link className="underline underline-offset-4" href={check.href}>
                {check.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl bg-muted p-4 text-sm">
        <h3 className="font-semibold">
          Build useful financial and property intelligence
        </h3>
        <p className="mt-2">
          Collections and arrears need recorded charges and payments.
          Predictions require sufficient history and the existing model
          readiness checks. Setup completion alone produces no forecast.
        </p>
        <div className="mt-3 flex flex-wrap gap-4">
          <Link href="/tenants" className="underline">
            Add or activate tenants
          </Link>
          <Link href="/integrations" className="underline">
            Configure rent collection
          </Link>
          <Link href="/predictive-intelligence" className="underline">
            Inspect intelligence readiness
          </Link>
        </div>
      </div>
    </section>
  );
}
