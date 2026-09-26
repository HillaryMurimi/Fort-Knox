import { api } from "../api";
import type { InventoryItem } from "./resource-types";

export interface CreateInventoryInput {
  unitId: string;
  assetTag: string;
  name: string;
  category: string;
  serialNumber?: string;
  condition: Exclude<InventoryItem["condition"], "DISPOSED">;
  maintenanceIntervalDays?: number;
  notes?: string;
  evidenceIds: string[];
}

export interface UpdateInventoryInput {
  status?: InventoryItem["status"];
  condition?: InventoryItem["condition"];
  lastServicedAt?: string;
  nextServiceDueAt?: string;
  notes?: string;
}

export const inventoryClient = {
  list: (organizationId: string) =>
    api<InventoryItem[]>(`/organizations/${organizationId}/inventory`),
  serviceDue: (organizationId: string) =>
    api<InventoryItem[]>(
      `/organizations/${organizationId}/inventory/service-due`,
    ),
  create: (organizationId: string, input: CreateInventoryInput) =>
    api<InventoryItem>(`/organizations/${organizationId}/inventory`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  update: (id: string, input: UpdateInventoryInput) =>
    api<InventoryItem>(`/inventory/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
};
