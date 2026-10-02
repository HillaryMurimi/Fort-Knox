export type DemoPlan = "CONTROL" | "FORT_KNOX";
export type DemoStory =
  | "RENT"
  | "MAINTENANCE"
  | "EXPENSES"
  | "PORTFOLIO"
  | "STAFF"
  | "VACANCY"
  | "EXECUTIVE"
  | "SECURITY"
  | "FULL";
export interface DemoProfile {
  companyName: string;
  contactName?: string;
  properties?: number;
  units?: number;
  propertyType?: string;
  use?: "RESIDENTIAL" | "COMMERCIAL" | "MIXED_USE";
  executiveApartments?: boolean;
  monthlyRentRollMinor?: number;
  occupancy?: number;
  managementMethod?: string;
  existingSoftware?: string;
  spreadsheetUsage?: string;
  whatsAppDependency?: string;
  paymentProcess?: string;
  maintenanceProcess?: string;
  staffStructure?: string;
  securityInfrastructure?: string;
  financialProblem?: string;
  operationalProblem?: string;
  managementFrustration?: string;
  securityConcern?: string;
  primaryPain: DemoStory;
  objective?: string;
  plan: DemoPlan;
  template: string;
}
export interface DemoUnit {
  id: string;
  property: string;
  building: string;
  floor: string;
  code: string;
  status: "OCCUPIED" | "VACANT";
  monthlyRentMinor: number;
  tenant?: string;
  tenancyId?: string;
  leaseEndsAt?: string;
  previousTenancyEnd?: string;
  vacantDays?: number;
  vacancyExposureMinor?: number;
  vacancyAction?: string;
}
export interface DemoCharge {
  id: string;
  unitId: string;
  tenancyId: string;
  dueAt: string;
  totalMinor: number;
  paidMinor: number;
  balanceMinor: number;
  status: "DUE" | "OVERDUE" | "PAID";
  followUp: string;
  history: Array<{ at: string; label: string; amountMinor: number }>;
}
export interface DemoMaintenance {
  id: string;
  unitId: string;
  title: string;
  description: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM";
  status:
    | "NEW"
    | "TRIAGED"
    | "ASSIGNED"
    | "APPROVAL_REQUIRED"
    | "APPROVED"
    | "IN_PROGRESS"
    | "COMPLETED"
    | "VERIFIED"
    | "CLOSED";
  requestedBy: string;
  responsible: string;
  contractor: string;
  assignedAt: string;
  deadline: string;
  quoteMinor: number;
  approvedMinor?: number;
  finalCostMinor?: number;
  evidenceIds: string[];
  approvedBy?: string;
  completionApprovedBy?: string;
  serviceStatus: string;
}
export interface DemoEvidence {
  id: string;
  resourceId: string;
  title: string;
  content: string;
  sha256: string;
  at: string;
  source: "DEMO";
}
export interface DemoIncident {
  id: string;
  property: string;
  location: string;
  camera: string;
  occurredAt: string;
  status: "OPEN" | "INVESTIGATING" | "ESCALATED" | "RESOLVED";
  responsible: string;
  response: string;
  evidenceIds: string[];
  source: "SIMULATED";
}
export interface DemoSnapshot {
  version: 1;
  dataset: "SALES_DEMO";
  asOf: string;
  clock: string;
  organizationName: string;
  plan: DemoPlan;
  story: DemoStory;
  units: DemoUnit[];
  charges: DemoCharge[];
  maintenance: DemoMaintenance[];
  incidents: DemoIncident[];
  evidence: DemoEvidence[];
  staff: Array<{
    id: string;
    responsible: string;
    assignment: string;
    assignedAt: string;
    deadline: string;
    status: "OVERDUE" | "ESCALATED" | "COMPLETED";
    evidence: string;
    approvedBy?: string;
  }>;
  notifications: Array<{
    id: string;
    channel: "SIMULATED SMS" | "SIMULATED IN-APP";
    recipient: string;
    message: string;
  }>;
  payments: Array<{
    id: string;
    chargeId: string;
    amountMinor: number;
    at: string;
    status: "RECONCILED";
    label: "SIMULATED PAYMENT";
    receipt: string;
  }>;
  history: Array<{
    at: string;
    action: string;
    resourceId: string;
    actor: string;
    outcome: string;
  }>;
  trends: Array<{
    month: string;
    expectedMinor: number;
    collectedMinor: number;
    occupancy: number;
    repairs: number;
  }>;
}
export type DemoActionKind =
  | "REVEAL_ARREARS"
  | "OPEN_TENANCY"
  | "SIMULATE_PAYMENT"
  | "RENT_DUE"
  | "ADVANCE_OVERDUE"
  | "FOLLOW_UP"
  | "REPORT_LEAK"
  | "TRIAGE"
  | "ASSIGN"
  | "QUOTE"
  | "APPROVE_MAINTENANCE"
  | "START_WORK"
  | "COMPLETE_REPAIR"
  | "VERIFY_REPAIR"
  | "CLOSE_REPAIR"
  | "REVEAL_VACANCY"
  | "VACANCY_ACTION"
  | "ESCALATE_TASK"
  | "COMPLETE_TASK"
  | "SIMULATE_SECURITY"
  | "INVESTIGATE_INCIDENT"
  | "ESCALATE_INCIDENT"
  | "RESOLVE_INCIDENT"
  | "READ_EVIDENCE"
  | "COMPLETE_DEMO"
  | "OFFER_PILOT";
export interface DemoAction {
  kind: DemoActionKind;
  resourceId?: string;
  amountMinor?: number;
}
export interface DemoSummary {
  expectedMinor: number;
  collectedMinor: number;
  outstandingMinor: number;
  overdueTenants: number;
  occupancy: number;
  collectionPercent: number;
  openMaintenance: number;
  approvals: number;
  attention: Array<{
    id: string;
    kind: "RENT" | "MAINTENANCE" | "VACANCY" | "STAFF" | "SECURITY";
    title: string;
    detail: string;
    amountMinor?: number;
  }>;
}
export interface DemoSessionView {
  id: string;
  leadId: string;
  revision: number;
  generation: number;
  profile: DemoProfile;
  snapshot: DemoSnapshot;
  summary: DemoSummary;
  pilotOrganizationId?: string;
  events: Array<{
    kind: string;
    resourceId: string;
    at: string;
    generation: number;
  }>;
}
