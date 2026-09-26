import { describe, expect, it } from "vitest";
import type { Expense, MaintenanceRequest } from "@/lib/data/resource-types";
import {
  landlordApprovalCounts,
  landlordMaintenanceAction,
} from "./landlord-workspace-model";

describe("landlord workspace model", () => {
  it("exposes only owner-level maintenance decisions", () => {
    expect(landlordMaintenanceAction("APPROVAL_REQUIRED")).toBe("APPROVE");
    expect(landlordMaintenanceAction("COMPLETED")).toBe("VERIFY");
    expect(landlordMaintenanceAction("VERIFIED")).toBe("CLOSE");
    expect(landlordMaintenanceAction("NEW")).toBeNull();
  });

  it("counts pending maintenance and expense approvals", () => {
    const maintenance = ["APPROVAL_REQUIRED", "IN_PROGRESS", "COMPLETED"].map(
      (status) => ({ status }) as MaintenanceRequest,
    );
    const expenses = [{ status: "SUBMITTED" }, { status: "PAID" }] as Expense[];
    expect(landlordApprovalCounts(maintenance, expenses)).toEqual({
      maintenance: 2,
      expenses: 1,
      total: 3,
    });
  });
});
