"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  inspectionsClient,
  type CompleteInspectionInput,
  type CreateInspectionInput,
} from "@/lib/data/inspections";
import { queryKeys } from "@/lib/data/query-keys";

export function useInspectionsQuery(org: string | null) {
  return useQuery({
    queryKey: org
      ? queryKeys.inspections.list(org)
      : ["inspections", "disabled"],
    queryFn: () => inspectionsClient.list(org as string),
    enabled: Boolean(org),
  });
}
export function useCreateInspectionMutation(org: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInspectionInput) =>
      inspectionsClient.create(org as string, input),
    onSuccess: () => {
      if (org)
        void client.invalidateQueries({
          queryKey: queryKeys.inspections.all(org),
        });
    },
  });
}
export function useCompleteInspectionMutation(org: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (value: { id: string; input: CompleteInspectionInput }) =>
      inspectionsClient.complete(value.id, value.input),
    onSuccess: () => {
      if (org)
        void client.invalidateQueries({
          queryKey: queryKeys.inspections.all(org),
        });
    },
  });
}
