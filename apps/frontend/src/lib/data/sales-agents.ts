import { api } from "@/lib/api";
export interface AgentConfiguration {
  enabled: boolean;
  paused: boolean;
  revision: number;
  maxDailyRuns: number;
  maxOutputTokens: number;
  maxDailyTokens: number;
  dailyBudgetMicroUsd: number;
  dailyRuns: number;
  reservedTokens: number;
  reservedMicroUsd: number;
}
export interface AgentDefinition {
  key: string;
  name: string;
  purpose: string;
  status: string;
  instructionVersion: number;
  executionEnabled: boolean;
  tools: string[];
  config: AgentConfiguration | null;
}
export interface AgentRun {
  _id: string;
  agent: string;
  leadId: string;
  status: string;
  createdAt: string;
  attempt: number;
  errorCode?: string;
  inputTokens?: number;
  outputTokens?: number;
  costMicroUsd?: number;
  costBasis?: string;
  objective?: string;
  output?: {
    summary: string;
    evidence: string[];
    confidence: string;
    limitation: string;
    action: {
      tool: string;
      reason: string;
      text: string;
      subject: string | null;
      sourceUrls: string[];
    };
  };
}
export interface AgentApproval {
  _id: string;
  status: string;
  payloadHash: string;
  risk: string;
  expiresAt: string;
  requiredPermission: string;
}
const base = "/sales/success";
const write = <T>(path: string, body: unknown, method = "POST") =>
  api<T>(base + path, { method, body: JSON.stringify(body) });
export const salesAgentClient = {
  catalog: () =>
    api<{
      outboundSuspended: boolean;
      agents: AgentDefinition[];
      integrations: Record<string, string>;
    }>(base + "/agents"),
  configure: (key: string, body: unknown) =>
    write(`/agents/${encodeURIComponent(key)}`, body, "PATCH"),
  create: (body: unknown) =>
    write<{ id: string; status: string }>("/agent-runs", body),
  list: (page: number) =>
    api<{ items: AgentRun[]; total: number; page: number }>(
      `${base}/agent-runs?page=${page}`,
    ),
  view: (id: string) =>
    api<{ run: AgentRun; approval: AgentApproval | null }>(
      `${base}/agent-runs/${id}`,
    ),
  control: (id: string, body: unknown) =>
    write(`/agent-runs/${id}/control`, body),
  decide: (id: string, body: unknown) =>
    write(`/approvals/${id}/decisions`, body),
};
