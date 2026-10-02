'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { monitoringClient, type AlertFilter, type AlertReview, type WindowInput } from '@/lib/data/platform-monitoring';
import { queryKeys } from '@/lib/data/query-keys';
export function useMonitoringOverview(enabled: boolean) {
  return useQuery({ queryKey: [...queryKeys.platform.monitoring(), 'overview'], queryFn: monitoringClient.overview, enabled, refetchInterval: 20000 });
}
export function useMonitoringAlerts(filter: AlertFilter, enabled: boolean) {
  return useQuery({ queryKey: [...queryKeys.platform.monitoring(), 'alerts', filter], queryFn: () => monitoringClient.alerts(filter), enabled, refetchInterval: 20000 });
}
export function useMonitoringHistory(id: string, page: number) {
  return useQuery({ queryKey: [...queryKeys.platform.monitoring(), 'history', id, page], queryFn: () => monitoringClient.history(id, page), enabled: !!id });
}
export function useMaintenanceWindows(enabled: boolean) {
  return useQuery({ queryKey: [...queryKeys.platform.monitoring(), 'windows'], queryFn: monitoringClient.windows, enabled, refetchInterval: 30000 });
}
type Action = { operation: 'REVIEW'; id: string; input: AlertReview } | { operation: 'CREATE_WINDOW'; input: WindowInput } | { operation: 'END_WINDOW'; id: string };
export function useMonitoringAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (action: Action) => action.operation === 'REVIEW' ? monitoringClient.review(action.id, action.input) : action.operation === 'CREATE_WINDOW' ? monitoringClient.createWindow(action.input) : monitoringClient.endWindow(action.id),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.platform.monitoring() }),
  });
}
