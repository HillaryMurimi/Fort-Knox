export const queryKeys = {
  organizations: {
    all: ["organizations"] as const,
    list: () => ["organizations", "list"] as const,
    detail: (organizationId: string) =>
      ["organizations", "detail", organizationId] as const,
  },
  properties: {
    all: (organizationId: string) => ["properties", organizationId] as const,
    list: (organizationId: string) =>
      ["properties", organizationId, "list"] as const,
    detail: (organizationId: string, propertyId: string) =>
      ["properties", organizationId, "detail", propertyId] as const,
  },
  buildings: {
    all: (organizationId: string) => ["buildings", organizationId] as const,
    list: (organizationId: string, propertyId?: string) =>
      ["buildings", organizationId, "list", propertyId ?? "all"] as const,
    detail: (organizationId: string, buildingId: string) =>
      ["buildings", organizationId, "detail", buildingId] as const,
  },
  floors: {
    all: (organizationId: string) => ["floors", organizationId] as const,
    list: (organizationId: string, buildingId?: string) =>
      ["floors", organizationId, "list", buildingId ?? "all"] as const,
    detail: (organizationId: string, floorId: string) =>
      ["floors", organizationId, "detail", floorId] as const,
  },
  units: {
    all: (organizationId: string) => ["units", organizationId] as const,
    list: (organizationId: string, floorId?: string) =>
      ["units", organizationId, "list", floorId ?? "all"] as const,
    detail: (organizationId: string, unitId: string) =>
      ["units", organizationId, "detail", unitId] as const,
  },
  tenants: {
    all: (organizationId: string) => ["tenants", organizationId] as const,
    list: (organizationId: string) =>
      ["tenants", organizationId, "list"] as const,
    detail: (organizationId: string, tenantId: string) =>
      ["tenants", organizationId, "detail", tenantId] as const,
  },
  tenancies: {
    all: (organizationId: string) => ["tenancies", organizationId] as const,
    list: (organizationId: string) =>
      ["tenancies", organizationId, "list"] as const,
    detail: (organizationId: string, tenancyId: string) =>
      ["tenancies", organizationId, "detail", tenancyId] as const,
  },
  finance: {
    all: (organizationId: string) => ["finance", organizationId] as const,
    rent: (organizationId: string) =>
      ["finance", organizationId, "rent"] as const,
    rentDetail: (organizationId: string, id: string) =>
      ["finance", organizationId, "rent", id] as const,
    payments: (organizationId: string) =>
      ["finance", organizationId, "payments"] as const,
    paymentDestinations: (organizationId: string) =>
      ["finance", organizationId, "payment-destinations"] as const,
    expenses: (organizationId: string) =>
      ["finance", organizationId, "expenses"] as const,
    serviceCharges: (organizationId: string) =>
      ["finance", organizationId, "service-charges"] as const,
    arrears: (organizationId: string) =>
      ["finance", organizationId, "arrears"] as const,
    report: (organizationId: string, params: string) =>
      ["finance", organizationId, "report", params] as const,
    periods: (organizationId: string) =>
      ["finance", organizationId, "periods"] as const,
  },
  contractors: {
    all: (organizationId: string) => ["contractors", organizationId] as const,
    list: (organizationId: string) =>
      ["contractors", organizationId, "list"] as const,
    detail: (organizationId: string, contractorId: string) =>
      ["contractors", organizationId, "detail", contractorId] as const,
  },
  maintenance: {
    all: (organizationId: string) => ["maintenance", organizationId] as const,
    list: (organizationId: string) =>
      ["maintenance", organizationId, "list"] as const,
    detail: (organizationId: string, maintenanceId: string) =>
      ["maintenance", organizationId, "detail", maintenanceId] as const,
    policy: (organizationId: string) =>
      ["maintenance", organizationId, "policy"] as const,
  },
  inspections: {
    all: (organizationId: string) => ["inspections", organizationId] as const,
    list: (organizationId: string) =>
      ["inspections", organizationId, "list"] as const,
  },
  inventory: {
    all: (organizationId: string) => ["inventory", organizationId] as const,
    list: (organizationId: string) =>
      ["inventory", organizationId, "list"] as const,
    due: (organizationId: string) =>
      ["inventory", organizationId, "due"] as const,
  },
  security: {
    all: (organizationId: string) => ["security", organizationId] as const,
    cameras: (organizationId: string) =>
      ["security", organizationId, "cameras"] as const,
    events: (organizationId: string, params: string) =>
      ["security", organizationId, "events", params] as const,
    summary: (organizationId: string) =>
      ["security", organizationId, "summary"] as const,
    incidents: (organizationId: string, params: string) =>
      ["security", organizationId, "incidents", params] as const,
    accessPoints: (organizationId: string) =>
      ["security", organizationId, "access-points"] as const,
    accessEvents: (organizationId: string, params: string) =>
      ["security", organizationId, "access-events", params] as const,
  },
  documents: {
    all: (organizationId: string) => ["documents", organizationId] as const,
    list: (organizationId: string) =>
      ["documents", organizationId, "list"] as const,
    detail: (organizationId: string, documentId: string) =>
      ["documents", organizationId, "detail", documentId] as const,
  },
  evidence: {
    all: (organizationId: string) => ["evidence", organizationId] as const,
    list: (organizationId: string, params: string) =>
      ["evidence", organizationId, "list", params] as const,
  },
  audit: {
    all: (organizationId: string) => ["audit", organizationId] as const,
    logs: (organizationId: string, params: string) =>
      ["audit", organizationId, "logs", params] as const,
    events: (organizationId: string, params: string) =>
      ["audit", organizationId, "events", params] as const,
  },
  decisionAutomation: {
    all: (organizationId: string) =>
      ["decision-automation", organizationId] as const,
    overview: (organizationId: string, params: string) =>
      ["decision-automation", organizationId, "overview", params] as const,
    policy: (organizationId: string) =>
      ["decision-automation", organizationId, "policy"] as const,
    actions: (organizationId: string, params: string) =>
      ["decision-automation", organizationId, "actions", params] as const,
    tenantRisks: (organizationId: string, params: string) =>
      ["decision-automation", organizationId, "tenant-risks", params] as const,
    vacancies: (organizationId: string, params: string) =>
      [
        "decision-automation",
        organizationId,
        "vacancy-forecasts",
        params,
      ] as const,
  },
  predictiveLearning: {
    all: (organizationId: string) =>
      ["predictive-learning", organizationId] as const,
    models: (organizationId: string, params: string) =>
      ["predictive-learning", organizationId, "models", params] as const,
  },
  modelServing: {
    all: (organizationId: string) => ["model-serving", organizationId] as const,
    policy: (organizationId: string) =>
      ["model-serving", organizationId, "policy"] as const,
    deployments: (organizationId: string, params: string) =>
      ["model-serving", organizationId, "deployments", params] as const,
    monitoring: (organizationId: string, params: string) =>
      ["model-serving", organizationId, "monitoring", params] as const,
    approvals: (organizationId: string, params: string) =>
      ["model-serving", organizationId, "approvals", params] as const,
    incidents: (organizationId: string, params: string) =>
      ["model-serving", organizationId, "incidents", params] as const,
  },
  billing: {
    all: (organizationId: string) => ["billing", organizationId] as const,
    plans: () => ["billing", "plans"] as const,
    subscription: (organizationId: string) =>
      ["billing", organizationId, "subscription"] as const,
    invoices: (organizationId: string, status?: string, page = 1) =>
      ["billing", organizationId, "invoices", status ?? "all", page] as const,
    usage: (organizationId: string) =>
      ["billing", organizationId, "usage"] as const,
    entitlements: (organizationId: string) =>
      ["billing", organizationId, "entitlements"] as const,
  },
  integrations: {
    all: () => ["integrations"] as const,
    health: () => ["integrations", "health"] as const,
  },
  platform: {
    all: () => ["platform"] as const,
    organizations: () => ["platform", "organizations"] as const,
    plans: () => ["platform", "plans"] as const,
    users: (organizationId: string) =>
      ["platform", "users", organizationId] as const,
    roles: (organizationId: string) =>
      ["platform", "roles", organizationId] as const,
    permissions: (organizationId: string) =>
      ["platform", "permissions", organizationId] as const,
    jobs: (organizationId: string, status?: string) =>
      ["platform", "jobs", organizationId, status ?? "all"] as const,
    audit: (organizationId: string) =>
      ["platform", "audit", organizationId] as const,
    events: (organizationId: string) =>
      ["platform", "events", organizationId] as const,
    diagnostics: () => ["platform", "diagnostics"] as const,
    integrations: () => ["platform", "integrations"] as const,
    subscription: (organizationId: string) =>
      ["platform", "subscription", organizationId] as const,
    usage: (organizationId: string) =>
      ["platform", "usage", organizationId] as const,
    invoices: (organizationId: string) =>
      ["platform", "invoices", organizationId] as const,
  },
  operations: {
    all: (organizationId: string) => ["operations", organizationId] as const,
    notifications: (organizationId: string, params: string) =>
      ["operations", organizationId, "notifications", params] as const,
    preferences: (organizationId: string) =>
      ["operations", organizationId, "notification-preferences"] as const,
    jobs: (organizationId: string, params: string) =>
      ["operations", organizationId, "jobs", params] as const,
  },
  commandCenter: {
    all: (organizationId: string) =>
      ["command-center", organizationId] as const,
    dashboard: (organizationId: string, params: string) =>
      ["command-center", organizationId, "dashboard", params] as const,
    propertyHealth: (organizationId: string, propertyId: string) =>
      [
        "command-center",
        organizationId,
        "property-health",
        propertyId,
      ] as const,
    alerts: (organizationId: string, params: string) =>
      ["command-center", organizationId, "alerts", params] as const,
    history: (organizationId: string, propertyId: string) =>
      ["command-center", organizationId, "history", propertyId] as const,
  },
} as const;
