import { api } from "@/lib/api";
export interface Customer {
  id: string;
  reference: string;
  name: string;
  email?: string;
  phone?: string;
  properties: number;
  units: string;
  challenge: string;
  source: string;
  stage: string;
  leadStatus: string;
  nextAction?: string;
  nextActionDate?: string;
  consent: string;
  revision: number;
  assignedTo?: string;
  organizationId?: string;
  identityState?: string;
}
export interface Meeting {
  _id: string;
  startsAt: string;
  endsAt: string;
  type: string;
  status: string;
  description?: string;
  outcome?: string;
  revision: number;
}
export interface CustomerView {
  customer: Customer;
  meetings: Meeting[];
  timeline: { _id: string; kind: string; text?: string; createdAt: string }[];
  historyLimit: { meetings: number; activities: number };
  historyCursors?: { meetings: string | null; activities: string | null };
}
export interface Monitor {
  linked: boolean;
  organizationId?: string;
  registered?: boolean;
  emailVerified?: boolean;
  lastLoginAt?: string;
  selectedPlan?: string;
  contractStatus?: string;
  checkoutStarted?: boolean;
  verifiedPayment?: boolean;
  subscriptionStatus?: string;
  properties?: number;
  buildings?: number;
  floors?: number;
  expectedUnits?: number | null;
  registeredUnits?: number;
  remainingUnits?: number | null;
  completionPercent?: number | null;
  stalled?: boolean;
  assistance?: string | null;
  lastActivity?: string;
  health?: { type: string; factors: { label: string; achieved: boolean }[] };
  events?: { eventId: string; name: string; occurredAt: string }[];
}
const base = "/sales/success";
const write = <T>(path: string, body: unknown, method = "POST") =>
  api<T>(base + path, { method, body: JSON.stringify(body) });
export const successClient = {
  list: (page: number, search: string) =>
    api<{
      items: (Omit<Customer, "id"> & { _id: string })[];
      total: number;
      page: number;
      pageSize: number;
    }>(`${base}/customers?page=${page}&search=${encodeURIComponent(search)}`),
  view: (id: string) => api<CustomerView>(`${base}/customers/${id}`),
  create: (body: unknown) => write<{ id: string }>("/customers", body),
  update: (id: string, body: unknown) =>
    write(`/customers/${id}`, body, "PATCH"),
  note: (id: string, text: string) => write(`/customers/${id}/notes`, { text }),
  meeting: (id: string, body: unknown) =>
    write(`/customers/${id}/meetings`, body),
  outcome: (id: string, meetingId: string, body: unknown) =>
    write(`/customers/${id}/meetings/${meetingId}`, body, "PATCH"),
  link: (id: string, body: unknown) =>
    write(`/customers/${id}/organization`, body),
  assign: (id: string, body: unknown) =>
    write(`/customers/${id}/assignment`, body),
  monitor: (id: string) => api<Monitor>(`${base}/customers/${id}/onboarding`),
  agents: () =>
    api<{
      outboundSuspended: boolean;
      agents: {
        key: string;
        name: string;
        purpose: string;
        status: string;
        instructionVersion: number;
      }[];
    }>(`${base}/agents`),
  grant: (body: unknown) => write("/permissions", body),
};
