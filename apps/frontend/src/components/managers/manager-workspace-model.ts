import type {
  ArrearsCase,
  Expense,
  MaintenanceRequest,
  Tenancy,
} from "@/lib/data/resource-types";

export type ManagerQueue = "ALL" | "MAINTENANCE" | "FINANCE" | "TENANCIES";

export function managerAttentionCounts(input: {
  maintenance: MaintenanceRequest[];
  expenses: Expense[];
  arrears: ArrearsCase[];
  tenancies: Tenancy[];
}) {
  const maintenance = input.maintenance.filter((item) =>
    ["NEW", "TRIAGED", "APPROVAL_REQUIRED", "COMPLETED", "VERIFIED"].includes(
      item.status,
    ),
  ).length;
  const finance =
    input.expenses.filter((item) => item.status === "SUBMITTED").length +
    input.arrears.filter(
      (item) => !["RESOLVED", "WRITTEN_OFF"].includes(item.status),
    ).length;
  const tenancies = input.tenancies.filter((item) =>
    ["DRAFT", "PENDING"].includes(item.status),
  ).length;
  return {
    maintenance,
    finance,
    tenancies,
    total: maintenance + finance + tenancies,
  };
}

export function maintenanceManagerAction(status: MaintenanceRequest["status"]) {
  if (status === "NEW") return "TRIAGE" as const;
  if (status === "TRIAGED") return "ASSIGN" as const;
  if (status === "APPROVAL_REQUIRED") return "APPROVE" as const;
  if (status === "COMPLETED") return "VERIFY" as const;
  if (status === "VERIFIED") return "CLOSE" as const;
  return null;
}

export function occupancyRate(units: number, occupied: number): number {
  return units > 0 ? Math.round((occupied / units) * 1000) / 10 : 0;
}
