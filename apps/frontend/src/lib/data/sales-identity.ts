import { api } from "@/lib/api";
export interface IdentityMatch {
  _id: string;
  organizationId: string;
  status: string;
  evidence: string;
  reviewReason?: string;
}
export interface MergePreview {
  id: string;
  payloadHash: string;
  source: { name: string; consent: string };
  target: { name: string; consent: string };
  expiresAt: string;
}
export interface HistoryItem {
  _id: string;
  kind?: string;
  text?: string;
  createdAt?: string;
  sourceOccurredAt?: string;
  startsAt?: string;
  type?: string;
  status?: string;
  description?: string;
  outcome?: string;
}
const base = "/sales/success";
const write = <T>(path: string, body: unknown) =>
  api<T>(base + path, { method: "POST", body: JSON.stringify(body) });
export const salesIdentityClient = {
  matches: (id: string) =>
    api<{ items: IdentityMatch[] }>(`${base}/customers/${id}/identity`),
  review: (id: string, body: unknown) =>
    write(`/customers/${id}/identity/decisions`, body),
  proposeMerge: (body: unknown) => write<MergePreview>("/merges", body),
  decideMerge: (id: string, body: unknown) =>
    write(`/merges/${id}/decisions`, body),
  replay: (body: unknown) => write("/lifecycle/replay", body),
  history: (id: string, kind: string, cursor?: string) =>
    api<{ items: HistoryItem[]; nextCursor: string | null }>(
      `${base}/customers/${id}/history?kind=${kind}&limit=25${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`,
    ),
};
