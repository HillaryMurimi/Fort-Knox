
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  Edit3,
  Home,
  UserRound,
  Power,
  XCircle,
  RefreshCw,
} from "lucide-react";

import { useOrganization } from "@/hooks/use-organization";

import {
  useTenancyQuery,
  useTenantQuery,
  useActivateTenancyMutation,
  useTerminateTenancyMutation,
} from "@/hooks/queries/use-tenant-queries";

import { useUnitQuery } from "@/hooks/queries/use-hierarchy-queries";
import { usePropertyQuery } from "@/hooks/queries/use-property-queries";

import { TenancyHeader } from "@/components/tenancies/tenancy-header";
import { TenancyForm } from "@/components/tenancies/tenancy-form";
import { MoveOutPanel } from "@/components/tenancies/move-out-panel";

import type { Tenancy } from "@/lib/data/resource-types";

export default function TenancyDetailPage() {
  const { tenancyId } =
    useParams<{ tenancyId: string }>();

  const { activeOrganizationId } =
    useOrganization();

  const tenancy = useTenancyQuery(
    activeOrganizationId,
    tenancyId,
  );

  const [edit, setEdit] = useState(false);

  if (!activeOrganizationId) {
    return (
      <State
        title="Select an organization"
        text="Choose an organization first."
      />
    );
  }

  if (tenancy.isLoading) {
    return (
      <State
        title="Loading tenancy…"
        text="Retrieving lease record."
      />
    );
  }

  if (
    tenancy.isError ||
    !tenancy.data
  ) {
    return (
      <State
        title="Tenancy unavailable"
        text={
          tenancy.error instanceof Error
            ? tenancy.error.message
            : "The tenancy could not be loaded."
        }
        retry={() =>
          void tenancy.refetch()
        }
      />
    );
  }

  return (
    <TenancyContent
      organizationId={activeOrganizationId}
      tenancy={tenancy.data}
      edit={edit}
      setEdit={setEdit}
    />
  );
}

interface TenancyContentProps {
  organizationId: string;
  tenancy: Tenancy;
  edit: boolean;
  setEdit: (value: boolean) => void;
}

function TenancyContent({
  organizationId,
  tenancy,
  edit,
  setEdit,
}: TenancyContentProps) {
  const tenant = useTenantQuery(
    organizationId,
    tenancy.tenantId,
  );

  const unit = useUnitQuery(
    organizationId,
    tenancy.unitId,
  );

  const property = usePropertyQuery(
    organizationId,
    tenancy.propertyId,
  );

  const activate =
    useActivateTenancyMutation(
      organizationId,
    );

  const terminate =
    useTerminateTenancyMutation(
      organizationId,
    );

  const [confirm, setConfirm] =
    useState<
      "activate" | "terminate" | null
    >(null);

  return (
    <div>
      <Link
        href="/tenants"
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        ← People & Tenancies
      </Link>

      <div className="mt-5">
        <TenancyHeader
          tenancy={tenancy}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-6">
        <section className="card p-5 lg:col-span-2">
          <div className="grid sm:grid-cols-2 gap-4">
            <Info
              label="Tenant"
              value={
                tenant.data
                  ? `Tenant ${tenant.data._id.slice(-8)}`
                  : tenancy.tenantId
              }
            />

            <Info
              label="Property"
              value={
                property.data?.name ??
                tenancy.propertyId
              }
            />

            <Info
              label="Unit"
              value={
                unit.data
                  ? `${unit.data.name} · ${unit.data.code}`
                  : tenancy.unitId
              }
            />

            <Info
              label="Lease"
              value={tenancy.leaseNumber}
            />

            <Info
              label="Start"
              value={new Date(
                tenancy.startDate,
              ).toLocaleDateString()}
            />

            <Info
              label="End"
              value={
                tenancy.endDate
                  ? new Date(
                      tenancy.endDate,
                    ).toLocaleDateString()
                  : "Open-ended"
              }
            />

            <Info
              label="Monthly rent"
              value={`KES ${tenancy.monthlyRent.toLocaleString()}`}
            />

            <Info
              label="Service charge"
              value={`KES ${(tenancy.serviceCharge ?? 0).toLocaleString()}`}
            />

            <Info
              label="Deposit"
              value={`KES ${(tenancy.depositAmount ?? 0).toLocaleString()}`}
            />

            <Info
              label="Billing day"
              value={String(
                tenancy.billingDay,
              )}
            />

            <Info
              label="Notice period"
              value={`${tenancy.noticePeriodDays} days`}
            />

            <Info
              label="Lease document"
              value={
                tenancy.signedLeaseDocumentId
                  ? "Attached"
                  : "Not attached"
              }
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {unit.data && (
              <Link
                href={`/units/${unit.data._id}`}
                className="btn-secondary"
              >
                <Home size={14} />
                View unit
              </Link>
            )}

            {tenant.data && (
              <Link
                href={`/tenants/${tenant.data._id}`}
                className="btn-secondary"
              >
                <UserRound size={14} />
                View tenant
              </Link>
            )}

            <button
              type="button"
              className="btn-secondary"
              onClick={() => setEdit(true)}
            >
              <Edit3 size={14} />
              Edit lease
            </button>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold">
            Lifecycle control
          </h2>

          <p className="text-xs text-muted-foreground mt-1">
            Transitions are executed by the
            Phase 19 backend.
          </p>

          <div className="space-y-2 mt-5">
            {[
              "DRAFT",
              "PENDING",
              "ACTIVE",
              "NOTICE",
              "MOVED_OUT / TERMINATED",
            ].map((step, index) => (
              <div
                key={step}
                className={`rounded-xl border p-3 text-sm ${
                  step === tenancy.status ||
                  step.includes(
                    tenancy.status,
                  )
                    ? "border-[#d97745] bg-[#fffaf7] font-semibold"
                    : "border-border text-muted-foreground"
                }`}
              >
                {index + 1}.{" "}
                {step.replaceAll("_", " ")}
              </div>
            ))}
          </div>

          {(tenancy.status === "DRAFT" ||
            tenancy.status === "PENDING") && (
            <button
              type="button"
              className="btn-primary w-full mt-5"
              disabled={activate.isPending}
              onClick={() =>
                setConfirm("activate")
              }
            >
              <Power size={14} />

              {activate.isPending
                ? "Activating…"
                : "Activate tenancy"}
            </button>
          )}

          {[
            "ACTIVE",
            "NOTICE",
          ].includes(tenancy.status) && (
            <button
              type="button"
              className="btn-secondary w-full mt-2"
              disabled={terminate.isPending}
              onClick={() =>
                setConfirm("terminate")
              }
            >
              <XCircle size={14} />

              {terminate.isPending
                ? "Terminating…"
                : "Terminate tenancy"}
            </button>
          )}
        </section>
      </div>

      {[
        "ACTIVE",
        "NOTICE",
      ].includes(tenancy.status) && (
        <div className="mt-4">
          <MoveOutPanel
            enabled={
              tenancy.status === "NOTICE"
            }
          />
        </div>
      )}

      {edit && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.currentTarget ===
              event.target
            ) {
              setEdit(false);
            }
          }}
        >
          <div className="modal-panel">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-semibold">
                Edit tenancy
              </h2>

              <button
                type="button"
                onClick={() =>
                  setEdit(false)
                }
              >
                ×
              </button>
            </div>

            <TenancyForm
              organizationId={
                organizationId
              }
              tenancy={tenancy}
              onDone={() =>
                setEdit(false)
              }
              onCancel={() =>
                setEdit(false)
              }
            />
          </div>
        </div>
      )}

      {confirm && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h2 className="text-lg font-semibold">
              {confirm === "activate"
                ? "Activate tenancy?"
                : "Terminate tenancy?"}
            </h2>

            <p className="text-sm text-muted-foreground mt-2">
              This calls the authoritative
              backend lifecycle transition
              and refreshes related caches.
            </p>

            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  setConfirm(null)
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="btn-primary"
                disabled={
                  activate.isPending ||
                  terminate.isPending
                }
                onClick={async () => {
                  try {
                    if (
                      confirm ===
                      "activate"
                    ) {
                      await activate.mutateAsync(
                        tenancy._id,
                      );
                    } else {
                      await terminate.mutateAsync(
                        tenancy._id,
                      );
                    }

                    setConfirm(null);
                  } catch {
                    // Mutation hooks handle request errors.
                  }
                }}
              >
                {confirm === "activate"
                  ? "Activate"
                  : "Terminate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-muted p-3">
      <div className="text-[11px] text-muted-foreground">
        {label}
      </div>

      <div className="text-sm font-semibold mt-1 break-words">
        {value}
      </div>
    </div>
  );
}

function State({
  title,
  text,
  retry,
}: {
  title: string;
  text: string;
  retry?: () => void;
}) {
  return (
    <div className="card p-10 text-center">
      <div className="font-semibold">
        {title}
      </div>

      <p className="text-sm text-muted-foreground mt-1">
        {text}
      </p>

      {retry && (
        <button
          type="button"
          onClick={retry}
          className="btn-secondary mt-4"
        >
          <RefreshCw size={14} />
          Try again
        </button>
      )}
    </div>
  );
}

