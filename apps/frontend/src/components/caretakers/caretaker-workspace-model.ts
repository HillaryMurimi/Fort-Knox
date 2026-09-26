import type {
  Incident,
  Inspection,
  MaintenanceRequest,
} from "@/lib/data/resource-types";

export type CaretakerMaintenanceAction =
  "TRIAGE" | "ASSIGN" | "QUOTE" | "START" | "COMPLETE" | "VERIFY" | "CLOSE";

export function caretakerMaintenanceAction(
  status: MaintenanceRequest["status"],
): CaretakerMaintenanceAction | null {
  if (status === "NEW") return "TRIAGE";
  if (status === "TRIAGED") return "ASSIGN";
  if (status === "ASSIGNED" || status === "QUOTED") return "QUOTE";
  if (status === "APPROVED") return "START";
  if (status === "IN_PROGRESS") return "COMPLETE";
  if (status === "COMPLETED") return "VERIFY";
  if (status === "VERIFIED") return "CLOSE";
  return null;
}

export function incidentNextStatuses(
  status: Incident["status"],
): Incident["status"][] {
  if (status === "OPEN") return ["INVESTIGATING", "FALSE_ALARM"];
  if (status === "INVESTIGATING")
    return ["CONTAINED", "RESOLVED", "FALSE_ALARM"];
  if (status === "CONTAINED") return ["RESOLVED"];
  if (status === "RESOLVED" || status === "FALSE_ALARM") return ["CLOSED"];
  return [];
}

export function caretakerAttentionCounts(input: {
  maintenance: MaintenanceRequest[];
  inspections: Inspection[];
  incidents: Incident[];
  unreadNotifications: number;
}) {
  const maintenance = input.maintenance.filter((item) =>
    caretakerMaintenanceAction(item.status),
  ).length;
  const inspections = input.inspections.filter((item) =>
    ["DRAFT", "IN_PROGRESS"].includes(item.status),
  ).length;
  const incidents = input.incidents.filter(
    (item) => !["CLOSED", "FALSE_ALARM"].includes(item.status),
  ).length;
  return {
    maintenance,
    inspections,
    incidents,
    updates: input.unreadNotifications,
    total: maintenance + inspections + incidents,
  };
}
