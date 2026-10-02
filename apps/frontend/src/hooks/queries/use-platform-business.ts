"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  platformBusinessClient,
  type BusinessFilters,
  type DrillKind,
} from "@/lib/data/platform-business";
const key = (filters: BusinessFilters) =>
  ["platform", "business", filters] as const;
export function usePlatformBusiness(filters: BusinessFilters, enabled = true) {
  return useQuery({
    queryKey: [...key(filters), "overview"],
    queryFn: () => platformBusinessClient.overview(filters),
    enabled,
    staleTime: 30000,
  });
}
export function useBusinessDrill(
  filters: BusinessFilters,
  kind: DrillKind,
  page: number,
  organizationId?: string,
  enabled = true,
) {
  return useQuery({
    queryKey: [...key(filters), "drill", kind, page, organizationId ?? "all"],
    queryFn: () =>
      platformBusinessClient.drill(filters, kind, page, organizationId),
    enabled,
    staleTime: 30000,
  });
}
export function useBriefHistory(
  filters: BusinessFilters,
  page: number,
  enabled = true,
) {
  return useQuery({
    queryKey: [...key(filters), "briefs", page],
    queryFn: () => platformBusinessClient.history(filters, page),
    enabled,
    staleTime: 30000,
  });
}
export function useHistoricalBrief(
  filters: BusinessFilters,
  id: string,
  enabled = true,
) {
  return useQuery({
    queryKey: [...key(filters), "brief", id],
    queryFn: () => platformBusinessClient.brief(filters, id),
    enabled: enabled && Boolean(id),
    staleTime: Infinity,
  });
}
export function useGenerateBrief(filters: BusinessFilters) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (idempotencyKey: string) =>
      platformBusinessClient.generate(filters, idempotencyKey),
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: ["platform", "business"] }),
  });
}
