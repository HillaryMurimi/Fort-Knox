import type { Expense, MaintenanceRequest } from "@/lib/data/resource-types";

export function landlordMaintenanceAction(
  status: MaintenanceRequest["status"],
) {
  if (status === "APPROVAL_REQUIRED") return "APPROVE" as const;
  if (status === "COMPLETED") return "VERIFY" as const;
  if (status === "VERIFIED") return "CLOSE" as const;
  return null;
}

export function landlordApprovalCounts(
  maintenance: MaintenanceRequest[],
  expenses: Expense[],
) {
  const maintenanceCount = maintenance.filter((item) =>
    landlordMaintenanceAction(item.status),
  ).length;
  const expenseCount = expenses.filter(
    (item) => item.status === "SUBMITTED",
  ).length;
  return {
    maintenance: maintenanceCount,
    expenses: expenseCount,
    total: maintenanceCount + expenseCount,
  };
}
