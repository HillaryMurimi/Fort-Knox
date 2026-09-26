"use client";

import { useState } from "react";
import {
  useCreateTenancyMutation,
  useUpdateTenancyMutation,
} from "@/hooks/queries/use-tenant-queries";
import type { Tenancy } from "@/lib/data/resource-types";

interface TenancyFormProps {
  organizationId: string;
  tenancy?: Tenancy;
  tenantId?: string;
  unitId?: string;
  onDone: () => void;
  onCancel: () => void;
}

export function TenancyForm({
  organizationId,
  tenancy,
  tenantId,
  unitId,
  onDone,
  onCancel,
}: TenancyFormProps) {
  const create = useCreateTenancyMutation(organizationId);

  const update = useUpdateTenancyMutation(
    organizationId,
    tenancy?._id ?? "",
  );

  const [tenant, setTenant] = useState(
    tenancy?.tenantId ?? tenantId ?? "",
  );

  const [unit, setUnit] = useState(
    tenancy?.unitId ?? unitId ?? "",
  );

  const [lease, setLease] = useState(
    tenancy?.leaseNumber ?? "",
  );

  const [start, setStart] = useState(
    tenancy?.startDate?.slice(0, 10) ?? "",
  );

  const [end, setEnd] = useState(
    tenancy?.endDate?.slice(0, 10) ?? "",
  );

  const [rent, setRent] = useState(
    String(tenancy?.monthlyRent ?? ""),
  );

  const [service, setService] = useState(
    String(tenancy?.serviceCharge ?? ""),
  );

  const [deposit, setDeposit] = useState(
    String(tenancy?.depositAmount ?? ""),
  );

  const [billing, setBilling] = useState(
    String(tenancy?.billingDay ?? 5),
  );

  const [notice, setNotice] = useState(
    String(tenancy?.noticePeriodDays ?? 30),
  );

  const [notes, setNotes] = useState(
    tenancy?.notes ?? "",
  );

  const pending =
    create.isPending || update.isPending;

  async function submit(
    e: React.FormEvent<HTMLFormElement>,
  ) {
    e.preventDefault();

    try {
      if (tenancy) {
        await update.mutateAsync({
          monthlyRent: Number(rent),
          billingDay: Number(billing),
          noticePeriodDays: Number(notice),

          ...(end
            ? {
                endDate: end,
              }
            : {}),

          ...(service
            ? {
                serviceCharge: Number(service),
              }
            : {}),

          ...(deposit
            ? {
                depositAmount: Number(deposit),
              }
            : {}),

          ...(notes
            ? {
                notes,
              }
            : {}),
        });
      } else {
        await create.mutateAsync({
          tenantId: tenant.trim(),
          unitId: unit.trim(),
          leaseNumber: lease.trim(),
          startDate: start,
          monthlyRent: Number(rent),
          billingDay: Number(billing),
          noticePeriodDays: Number(notice),

          ...(end
            ? {
                endDate: end,
              }
            : {}),

          ...(service
            ? {
                serviceCharge: Number(service),
              }
            : {}),

          ...(deposit
            ? {
                depositAmount: Number(deposit),
              }
            : {}),

          ...(notes
            ? {
                notes,
              }
            : {}),
        });
      }

      onDone();
    } catch {
      // Mutation hooks handle request errors.
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4"
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <label>
          <span className="field-label">
            Tenant ID
          </span>

          <input
            required={!tenancy}
            disabled={Boolean(tenancy)}
            value={tenant}
            onChange={(e) =>
              setTenant(e.target.value)
            }
          />
        </label>

        <label>
          <span className="field-label">
            Unit ID
          </span>

          <input
            required={!tenancy}
            disabled={Boolean(tenancy)}
            value={unit}
            onChange={(e) =>
              setUnit(e.target.value)
            }
          />
        </label>
      </div>

      {!tenancy && (
        <label>
          <span className="field-label">
            Lease number
          </span>

          <input
            required
            value={lease}
            onChange={(e) =>
              setLease(e.target.value)
            }
          />
        </label>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <label>
          <span className="field-label">
            Start date
          </span>

          <input
            required={!tenancy}
            type="date"
            value={start}
            disabled={Boolean(tenancy)}
            onChange={(e) =>
              setStart(e.target.value)
            }
          />
        </label>

        <label>
          <span className="field-label">
            End date
          </span>

          <input
            type="date"
            value={end}
            onChange={(e) =>
              setEnd(e.target.value)
            }
          />
        </label>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <label>
          <span className="field-label">
            Monthly rent (KES)
          </span>

          <input
            required
            type="number"
            min="0"
            value={rent}
            onChange={(e) =>
              setRent(e.target.value)
            }
          />
        </label>

        <label>
          <span className="field-label">
            Service charge
          </span>

          <input
            type="number"
            min="0"
            value={service}
            onChange={(e) =>
              setService(e.target.value)
            }
          />
        </label>

        <label>
          <span className="field-label">
            Deposit
          </span>

          <input
            type="number"
            min="0"
            value={deposit}
            onChange={(e) =>
              setDeposit(e.target.value)
            }
          />
        </label>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <label>
          <span className="field-label">
            Billing day
          </span>

          <input
            required
            type="number"
            min="1"
            max="28"
            value={billing}
            onChange={(e) =>
              setBilling(e.target.value)
            }
          />
        </label>

        <label>
          <span className="field-label">
            Notice period (days)
          </span>

          <input
            required
            type="number"
            min="0"
            value={notice}
            onChange={(e) =>
              setNotice(e.target.value)
            }
          />
        </label>
      </div>

      <label>
        <span className="field-label">
          Notes
        </span>

        <textarea
          rows={3}
          value={notes}
          onChange={(e) =>
            setNotes(e.target.value)
          }
        />
      </label>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="btn-secondary"
          onClick={onCancel}
        >
          Cancel
        </button>

        <button
          type="submit"
          className="btn-primary"
          disabled={pending}
        >
          {pending
            ? "Saving…"
            : tenancy
              ? "Save changes"
              : "Create tenancy"}
        </button>
      </div>
    </form>
  );
}