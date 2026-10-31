import { api } from '@/lib/api';
export interface SalesCampaign {
  _id: string; name: string; description: string; audience: string; market: string; channel: string; agent: string;
  startsAt: string; endsAt: string; messaging: string; selectionCriteria: string; dailySendLimit: number;
  perContactLimit: number; followUpDays: number[]; budgetMicroUsd: number; attributionDays: number;
  status: string; revision: number; payloadHash?: string;
}
export interface SalesLink { _id: string; leadId: string; destination: string; expiresAt: string; revokedAt?: string }
const base = '/sales/success';
const post = <T>(path: string, body: unknown) => api<T>(base + path, { method: 'POST', body: JSON.stringify(body) });
export const campaignClient = {
  list: (page: number) => api<{ items: SalesCampaign[]; total: number }>(`${base}/campaigns?page=${page}`),
  create: (body: unknown) => post<SalesCampaign>('/campaigns', body),
  update: (id: string, body: unknown) => api<SalesCampaign>(`${base}/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  command: (id: string, body: unknown) => post<SalesCampaign>(`/campaigns/${id}/commands`, body),
  links: (id: string, page: number) => api<{ items: SalesLink[] }>(`${base}/campaigns/${id}/links?page=${page}`),
  link: (id: string, body: unknown) => post<{ href: string }>(`/campaigns/${id}/links`, body),
  revoke: (id: string) => post(`/tracking-links/${id}/revoke`, {}),
};
