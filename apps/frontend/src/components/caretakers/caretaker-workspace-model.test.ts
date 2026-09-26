import { describe, expect, it } from "vitest";
import type {
  Incident,
  Inspection,
  MaintenanceRequest,
} from "@/lib/data/resource-types";
import {
  caretakerAttentionCounts,
  caretakerMaintenanceAction,
  incidentNextStatuses,
} from "./caretaker-workspace-model";

describe("caretaker workspace model", () => {
  it("maps only field-authorized maintenance states", () => {
    expect(caretakerMaintenanceAction("NEW")).toBe("TRIAGE");
    expect(caretakerMaintenanceAction("TRIAGED")).toBe("ASSIGN");
    expect(caretakerMaintenanceAction("ASSIGNED")).toBe("QUOTE");
    expect(caretakerMaintenanceAction("APPROVAL_REQUIRED")).toBeNull();
    expect(caretakerMaintenanceAction("APPROVED")).toBe("START");
    expect(caretakerMaintenanceAction("IN_PROGRESS")).toBe("COMPLETE");
    expect(caretakerMaintenanceAction("COMPLETED")).toBe("VERIFY");
    expect(caretakerMaintenanceAction("VERIFIED")).toBe("CLOSE");
  });

  it("uses the controlled incident transition graph", () => {
    expect(incidentNextStatuses("OPEN")).toEqual([
      "INVESTIGATING",
      "FALSE_ALARM",
    ]);
    expect(incidentNextStatuses("CONTAINED")).toEqual(["RESOLVED"]);
    expect(incidentNextStatuses("CLOSED")).toEqual([]);
  });

  it("counts field attention without financial approvals", () => {
    expect(
      caretakerAttentionCounts({
        maintenance: [
          { status: "NEW" },
          { status: "APPROVAL_REQUIRED" },
        ] as MaintenanceRequest[],
        inspections: [{ status: "DRAFT" }] as Inspection[],
        incidents: [
          { status: "INVESTIGATING" },
          { status: "CLOSED" },
        ] as Incident[],
        unreadNotifications: 2,
      }),
    ).toEqual({
      maintenance: 1,
      inspections: 1,
      incidents: 1,
      updates: 2,
      total: 3,
    });
  });
});
