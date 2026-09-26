"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  inventoryClient,
  type CreateInventoryInput,
  type UpdateInventoryInput,
} from "@/lib/data/inventory";
import { queryKeys } from "@/lib/data/query-keys";

export function useInventoryQuery(org: string | null) {
  return useQuery({
    queryKey: org ? queryKeys.inventory.list(org) : ["inventory", "disabled"],
    queryFn: () => inventoryClient.list(org as string),
    enabled: Boolean(org),
  });
}
export function useInventoryDueQuery(org: string | null) {
  return useQuery({
    queryKey: org
      ? queryKeys.inventory.due(org)
      : ["inventory-due", "disabled"],
    queryFn: () => inventoryClient.serviceDue(org as string),
    enabled: Boolean(org),
  });
}
export function useCreateInventoryMutation(org: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInventoryInput) =>
      inventoryClient.create(org as string, input),
    onSuccess: () => {
      if (org)
        void client.invalidateQueries({
          queryKey: queryKeys.inventory.all(org),
        });
    },
  });
}
export function useUpdateInventoryMutation(org: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (value: { id: string; input: UpdateInventoryInput }) =>
      inventoryClient.update(value.id, value.input),
    onSuccess: () => {
      if (org)
        void client.invalidateQueries({
          queryKey: queryKeys.inventory.all(org),
        });
    },
  });
}
