import { api } from "../api";
import type { Inspection } from "./resource-types";

export interface CreateInspectionInput {
  unitId: string;
  tenancyId?: string;
  maintenanceRequestId?: string;
  type: Inspection["type"];
  overallCondition?: Inspection["overallCondition"];
  checklist?: Inspection["checklist"];
  meterReadings?: Inspection["meterReadings"];
  notes?: string;
  evidenceIds?: string[];
}

export interface CompleteInspectionInput {
  overallCondition?: Inspection["overallCondition"];
  notes?: string;
  evidenceIds?: string[];
}

export const inspectionsClient = {
  list: (organizationId: string) =>
    api<Inspection[]>(`/organizations/${organizationId}/inspections`),
  create: (organizationId: string, input: CreateInspectionInput) =>
    api<Inspection>(`/organizations/${organizationId}/inspections`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  complete: (inspectionId: string, input: CompleteInspectionInput) =>
    api<Inspection>(`/inspections/${inspectionId}/complete`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
