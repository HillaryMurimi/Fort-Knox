import { describe, expect, it } from "vitest";
import type {
  ArrearsCase,
  Expense,
  MaintenanceRequest,
  Tenancy,
} from "@/lib/data/resource-types";
import {
  maintenanceManagerAction,
  managerAttentionCounts,
  occupancyRate,
} from "./manager-workspace-model";

const maintenance = (status: MaintenanceRequest["status"]) =>
  ({ status }) as MaintenanceRequest;

describe("manager workspace model", () => {
  it("maps controlled maintenance states to the correct manager action", () => {
    expect(maintenanceManagerAction("NEW")).toBe("TRIAGE");
    expect(maintenanceManagerAction("APPROVAL_REQUIRED")).toBe("APPROVE");
    expect(maintenanceManagerAction("COMPLETED")).toBe("VERIFY");
    expect(maintenanceManagerAction("IN_PROGRESS")).toBeNull();
  });

  it("counts only records that require manager attention", () => {
    const counts = managerAttentionCounts({
      maintenance: [
        maintenance("NEW"),
        maintenance("IN_PROGRESS"),
        maintenance("COMPLETED"),
      ],
      expenses: [{ status: "SUBMITTED" }, { status: "PAID" }] as Expense[],
      arrears: [{ status: "OPEN" }, { status: "RESOLVED" }] as ArrearsCase[],
      tenancies: [{ status: "PENDING" }, { status: "ACTIVE" }] as Tenancy[],
    });
    expect(counts).toEqual({
      maintenance: 2,
      finance: 2,
      tenancies: 1,
      total: 5,
    });
  });

  it("calculates stable occupancy percentages including an empty portfolio", () => {
    expect(occupancyRate(20, 17)).toBe(85);
    expect(occupancyRate(0, 0)).toBe(0);
  });
});
