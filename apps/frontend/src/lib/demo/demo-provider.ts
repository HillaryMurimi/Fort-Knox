import { getDemoRole, DEV_DEMO_MODE } from "./demo-config";
import {
  commandCenter,
  demoArrears,
  demoBuildings,
  demoCameras,
  demoContractors,
  demoDocuments,
  demoExpenses,
  demoFinancialPeriods,
  demoIncidents,
  demoInspections,
  demoFloors,
  demoMaintenance,
  demoNotifications,
  demoOrganization,
  demoPayments,
  demoProperties,
  demoRentCharges,
  demoSecurityEvents,
  demoServiceCharges,
  demoTenancies,
  demoTenants,
  demoUnits,
  demoUserForRole,
  financialReport,
  propertyHealth,
  tenantWorkspaceData,
} from "./demo-data";

interface DemoRequestInit extends RequestInit {
  authenticated?: boolean;
}

const state = {
  properties: [...demoProperties],
  buildings: [...demoBuildings],
  floors: [...demoFloors],
  units: [...demoUnits],
  tenants: [...demoTenants],
  tenancies: [...demoTenancies],
  rent: [...demoRentCharges],
  payments: [...demoPayments],
  expenses: [...demoExpenses],
  arrears: [...demoArrears],
  serviceCharges: [...demoServiceCharges],
  financialPeriods: [...demoFinancialPeriods],
  maintenance: [...demoMaintenance],
  inspections: [...demoInspections],
  contractors: [...demoContractors],
  documents: [...demoDocuments],
  notifications: [...demoNotifications],
  cameras: [...demoCameras],
  securityEvents: [...demoSecurityEvents],
  incidents: [...demoIncidents],
  inventory: [
    {
      _id: "demo-inventory-1",
      organizationId: demoOrganization._id,
      propertyId: "demo-property-1",
      buildingId: "demo-building-1",
      floorId: "demo-floor-1",
      unitId: "demo-unit-101",
      assetTag: "PUMP-001",
      name: "Domestic water booster pump",
      category: "Water system",
      condition: "FAIR",
      status: "ACTIVE",
      maintenanceIntervalDays: 90,
      lastServicedAt: "2026-05-01T08:00:00.000Z",
      nextServiceDueAt: "2026-07-30T08:00:00.000Z",
      notes: "Check pressure switch at next service.",
      evidenceIds: [],
    },
    {
      _id: "demo-inventory-2",
      organizationId: demoOrganization._id,
      propertyId: "demo-property-1",
      buildingId: "demo-building-2",
      floorId: "demo-floor-5",
      unitId: "demo-unit-501",
      assetTag: "EXT-014",
      name: "Ground floor fire extinguisher",
      category: "Fire safety",
      condition: "GOOD",
      status: "ACTIVE",
      maintenanceIntervalDays: 365,
      nextServiceDueAt: "2027-02-15T08:00:00.000Z",
      evidenceIds: [],
    },
  ],
  paymentDestinations: [] as Array<Record<string, unknown>>,
  intelligenceAlerts: [...commandCenter().activeAlerts],
};

const json = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function bodyOf(init: DemoRequestInit): Record<string, unknown> {
  if (!init.body || typeof init.body !== "string") return {};
  try {
    return JSON.parse(init.body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function organizationList() {
  return [demoOrganization];
}
const ROLE_PROPERTY_SCOPE: Record<string, string[]> = {
  SUPER_ADMIN: ["demo-property-1", "demo-property-2"],
  LANDLORD: ["demo-property-1", "demo-property-2"],
  PROPERTY_MANAGER: ["demo-property-1", "demo-property-2"],
  CARETAKER: ["demo-property-1"],
  CONTRACTOR: ["demo-property-1"],
  TENANT: ["demo-property-1"],
};

const ROLE_BUILDING_SCOPE: Record<string, string[]> = {
  SUPER_ADMIN: ["demo-building-1", "demo-building-2", "demo-building-3"],
  LANDLORD: ["demo-building-1", "demo-building-2", "demo-building-3"],
  PROPERTY_MANAGER: ["demo-building-1", "demo-building-2", "demo-building-3"],
  CARETAKER: ["demo-building-1", "demo-building-2"],
  CONTRACTOR: ["demo-building-1"],
  TENANT: ["demo-building-1"],
};

const ROLE_UNIT_SCOPE: Record<string, string[]> = {
  SUPER_ADMIN: demoUnits.map((item) => item._id),
  LANDLORD: demoUnits.map((item) => item._id),
  PROPERTY_MANAGER: demoUnits.map((item) => item._id),
  CARETAKER: demoUnits
    .filter((item) => item.propertyId === "demo-property-1")
    .map((item) => item._id),
  CONTRACTOR: ["demo-unit-101", "demo-unit-302"],
  TENANT: ["demo-unit-101"],
};

function scoped<T extends object>(items: T[]): T[] {
  const records = items as Array<Record<string, unknown>>;
  const role = getDemoRole();
  const propertyIds = ROLE_PROPERTY_SCOPE[role] ?? [];
  const buildingIds = ROLE_BUILDING_SCOPE[role] ?? [];
  const unitIds = ROLE_UNIT_SCOPE[role] ?? [];
  const tenant = role === "TENANT" ? tenantWorkspaceData().tenant : null;
  const tenantUnitId =
    role === "TENANT" ? tenantWorkspaceData().unit._id : null;

  return records.filter((item) => {
    if (role === "TENANT") {
      return (
        (!item.tenantId || item.tenantId === tenant?._id) &&
        (!item.unitId || item.unitId === tenantUnitId) &&
        (!item.propertyId || propertyIds.includes(String(item.propertyId))) &&
        (!item.buildingId || buildingIds.includes(String(item.buildingId)))
      );
    }

    if (item.unitId && !unitIds.includes(String(item.unitId))) return false;
    if (item.buildingId && !buildingIds.includes(String(item.buildingId)))
      return false;
    if (item.propertyId && !propertyIds.includes(String(item.propertyId)))
      return false;
    if (
      item.contractorId &&
      role === "CONTRACTOR" &&
      item.contractorId !== "demo-contractor-1"
    )
      return false;
    return true;
  }) as T[];
}

function byId<T extends { _id: string }>(items: T[], id: string): T | null {
  return items.find((item) => item._id === id) ?? null;
}

function pathParts(path: string): string[] {
  const clean = path.split("?")[0] ?? "";
  return clean.split("/").filter(Boolean);
}
function idFromPath(parts: string[], singular: string): string | null {
  const index = parts.indexOf(singular);
  return index >= 0 ? (parts[index + 1] ?? null) : null;
}

function collectionFor(parts: string[]) {
  if (parts.includes("properties")) return state.properties;
  if (parts.includes("buildings")) return state.buildings;
  if (parts.includes("floors")) return state.floors;
  if (parts.includes("units")) return state.units;
  if (parts.includes("tenants")) return state.tenants;
  if (parts.includes("tenancies")) return state.tenancies;
  if (parts.includes("rent")) return state.rent;
  if (parts.includes("payments")) return state.payments;
  if (parts.includes("expenses")) return state.expenses;
  if (parts.includes("arrears")) return state.arrears;
  if (parts.includes("maintenance")) return state.maintenance;
  if (parts.includes("inspections")) return state.inspections;
  if (parts.includes("contractors")) return state.contractors;
  if (parts.includes("documents")) return state.documents;
  if (parts.includes("notifications")) return state.notifications;
  if (parts.includes("incidents")) return state.incidents;
  if (parts.includes("inventory")) return state.inventory;
  if (parts.includes("cctv")) return state.cameras;
  if (parts.includes("security")) return state.securityEvents;
  return null;
}

function filterByParent<T extends object>(items: T[], parts: string[]): T[] {
  const propertyId = idFromPath(parts, "properties");
  const buildingId = idFromPath(parts, "buildings");
  const floorId = idFromPath(parts, "floors");
  if (propertyId && parts.includes("buildings"))
    return items.filter(
      (item) =>
        (item as unknown as Record<string, unknown>).propertyId === propertyId,
    );
  if (buildingId && parts.includes("floors"))
    return items.filter(
      (item) =>
        (item as unknown as Record<string, unknown>).buildingId === buildingId,
    );
  if (floorId && parts.includes("units"))
    return items.filter(
      (item) =>
        (item as unknown as Record<string, unknown>).floorId === floorId,
    );
  return items;
}

function get(path: string): unknown {
  const clean = path.split("?")[0] ?? "";
  const parts = pathParts(path);

  if (clean === "/organizations") return organizationList();
  if (clean === `/organizations/${demoOrganization._id}`)
    return demoOrganization;
  if (clean.includes("/command-center")) {
    const role = getDemoRole();
    if (role === "TENANT" || role === "CONTRACTOR" || role === "CARETAKER")
      return null;
    return { ...commandCenter(), activeAlerts: state.intelligenceAlerts };
  }
  if (clean.includes("/financial-report")) {
    const role = getDemoRole();
    if (role === "TENANT" || role === "CONTRACTOR" || role === "CARETAKER")
      return null;
    return financialReport();
  }
  if (clean.endsWith("/integrations/health"))
    return {
      providers: {
        mpesa: false,
        paystack: false,
        stripe: false,
        email: false,
        sms: false,
        whatsapp: false,
        cloudinary: false,
        s3: false,
        cctv: false,
        nvr: false,
      },
    };
  if (clean.includes("/property-health") || clean.endsWith("/health"))
    return propertyHealth(idFromPath(parts, "properties") ?? "demo-property-1");
  if (clean.includes("/health/history")) return [];
  if (clean.includes("/security/summary")) {
    const openEvents = scoped(state.securityEvents).filter((item) =>
      ["OPEN", "ACKNOWLEDGED", "ESCALATED"].includes(item.status),
    );
    return {
      criticalOpenEvents: openEvents.filter(
        (item) => item.severity === "CRITICAL",
      ).length,
      highOpenEvents: openEvents.filter((item) => item.severity === "HIGH")
        .length,
      totalOpenEvents: openEvents.length,
      offlineCameras: scoped(state.cameras).filter(
        (item) => item.status === "OFFLINE" || item.status === "DEGRADED",
      ).length,
      deniedAccessEvents24h: openEvents.filter(
        (item) => item.type === "ACCESS_DENIED",
      ).length,
    };
  }
  if (clean.includes("/tenant-workspace")) return tenantWorkspaceData();
  if (clean.endsWith("/contractors")) {
    const role = getDemoRole();
    if (role === "TENANT") return null;
    return scoped(state.contractors);
  }
  if (clean.includes("/contractors/") && clean.endsWith("/performance"))
    return (
      byId(state.contractors, idFromPath(parts, "contractors") ?? "")
        ?.performance ?? null
    );
  if (clean.endsWith("/service-charges")) return scoped(state.serviceCharges);
  if (clean.endsWith("/arrears")) return scoped(state.arrears);
  if (clean.endsWith("/financial-periods")) return state.financialPeriods;
  if (clean.endsWith("/documents")) return scoped(state.documents);
  if (clean.endsWith("/evidence"))
    return scoped(
      state.documents.map((item) => ({
        _id: `evidence-${item._id}`,
        organizationId: item.organizationId,
        documentId: item._id,
        title: item.title,
        category: "DOCUMENT",
        status: "VERIFIED",
        createdAt: item.createdAt,
      })),
    );
  if (clean.endsWith("/cctv/cameras")) return scoped(state.cameras);
  if (clean.endsWith("/security/events")) return scoped(state.securityEvents);
  if (clean.endsWith("/incidents")) return scoped(state.incidents);
  if (clean.endsWith("/access-points"))
    return [
      {
        _id: "demo-access-1",
        organizationId: demoOrganization._id,
        propertyId: "demo-property-1",
        name: "North Gate",
        pointCode: "NG-01",
        type: "MAIN_GATE",
        status: "ACTIVE",
        provider: "Demo Access",
      },
    ];
  if (clean.endsWith("/access-events")) return [];
  if (clean.endsWith("/properties")) return scoped(state.properties);
  if (clean.endsWith("/buildings"))
    return filterByParent(scoped(state.buildings), parts);
  if (clean.endsWith("/floors"))
    return filterByParent(scoped(state.floors), parts);
  if (clean.endsWith("/units"))
    return filterByParent(scoped(state.units), parts);
  if (clean.endsWith("/tenants")) return scoped(state.tenants);
  if (clean.endsWith("/tenancies")) return scoped(state.tenancies);
  if (clean.endsWith("/rent")) return scoped(state.rent);
  if (clean.endsWith("/payments")) return scoped(state.payments);
  if (clean.endsWith("/payment-destinations")) return state.paymentDestinations;
  if (clean.endsWith("/expenses")) return scoped(state.expenses);
  if (clean.endsWith("/maintenance")) return scoped(state.maintenance);
  if (clean.endsWith("/inspections")) return scoped(state.inspections);
  if (clean.endsWith("/inventory/service-due"))
    return scoped(state.inventory).filter(
      (item) =>
        item.nextServiceDueAt &&
        new Date(item.nextServiceDueAt).getTime() <= Date.now() &&
        ["ACTIVE", "UNDER_REPAIR"].includes(item.status),
    );
  if (clean.endsWith("/inventory")) return scoped(state.inventory);
  if (clean.endsWith("/maintenance-policy"))
    return {
      _id: "demo-maint-policy",
      organizationId: demoOrganization._id,
      approvalThreshold: 25000,
      emergencyAutoApprove: true,
      autoApproveRoles: ["LANDLORD"],
      currency: "KES",
    };
  if (clean.endsWith("/notifications"))
    return state.notifications.filter(
      (item) => item.recipientUserId === demoUserForRole(getDemoRole())._id,
    );
  if (clean.endsWith("/notification-preferences")) return [];
  if (clean.endsWith("/jobs"))
    return {
      data: [],
      meta: { pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 } },
    };
  if (clean.endsWith("/audit-logs")) return [];
  if (clean.endsWith("/billing/plans"))
    return [
      {
        _id: "demo-plan-pro",
        key: "PRO",
        name: "Command Center Pro",
        description: "Full property command center",
        currency: "KES",
        amount: 499,
        billingInterval: "MONTH",
        trialDays: 14,
        active: true,
        entitlements: {
          maxProperties: 25,
          maxUnits: 500,
          maxUsers: 50,
          maxTenants: 500,
          features: ["COMMAND_CENTER", "INTELLIGENCE", "SECURITY"],
        },
      },
    ];
  if (
    clean.includes("/billing/organizations/") &&
    clean.endsWith("/subscription")
  )
    return {
      _id: "demo-subscription",
      organizationId: demoOrganization._id,
      planId: "demo-plan-pro",
      status: "ACTIVE",
      currentPeriodStart: "2026-09-01",
      currentPeriodEnd: "2026-10-01",
      cancelAtPeriodEnd: false,
      provider: "INTERNAL",
    };
  if (
    clean.endsWith("/billing/organizations/" + demoOrganization._id + "/usage")
  )
    return {
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      metrics: { PROPERTIES: 2, UNITS: 20, USERS: 12, TENANTS: 6 },
    };
  if (
    clean.endsWith(
      "/billing/organizations/" + demoOrganization._id + "/entitlements",
    )
  )
    return {
      status: "ACTIVE",
      plan: {
        _id: "demo-plan-pro",
        key: "PRO",
        name: "Command Center Pro",
        currency: "KES",
        amount: 499,
        billingInterval: "MONTH",
        trialDays: 14,
        active: true,
        entitlements: {
          maxProperties: 25,
          maxUnits: 500,
          maxUsers: 50,
          maxTenants: 500,
          features: ["COMMAND_CENTER", "INTELLIGENCE", "SECURITY"],
        },
      },
    };
  if (clean.endsWith("/integrations/health"))
    return {
      mpesa: true,
      sms: true,
      email: true,
      whatsapp: false,
      storage: true,
      cctv: true,
    };
  if (clean.endsWith("/integrations/integrations/health"))
    return {
      mpesa: true,
      sms: true,
      email: true,
      whatsapp: false,
      storage: true,
      cctv: true,
    };
  if (clean.includes("/decision-automation"))
    return {
      asOf: new Date().toISOString(),
      modelVersion: "demo-2026.09",
      portfolio: {
        propertyCount: 2,
        openActions: 3,
        criticalActions: 0,
        totalMoneyAtRisk: 74200,
        highRiskTenants: 2,
        prolongedVacancies: 2,
      },
      trendVelocity: {
        healthScoreVelocity: 0.7,
        propertiesWithNegativeVelocity: 1,
        propertyCount: 2,
      },
      actions: [],
      tenantRisks: [],
      vacancyForecasts: [],
      revenueForecasts: [],
    };
  if (clean.includes("/predictive-learning/models")) return [];
  if (clean.includes("/model-serving/policy"))
    return {
      _id: "demo-model-policy",
      organizationId: demoOrganization._id,
      enabled: true,
      mode: "ACTIVE",
      canaryPercent: 10,
      minConfidence: 0.8,
      mlActionMinConfidence: 0.88,
      requireValidation: true,
      maxDriftPsi: 0.2,
      maxPerformanceDegradation: 0.1,
      autoRollbackOnCriticalDrift: true,
      autoRollbackOnPerformanceDegradation: true,
      approvalValidityHours: 24,
      domains: { ARREARS: true, VACANCY: true, REVENUE: true },
    };
  if (
    clean.includes("/model-serving/deployments") ||
    clean.includes("/model-serving/monitoring") ||
    clean.includes("/model-serving/approvals") ||
    clean.includes("/model-serving/incidents")
  )
    return [];
  if (clean.includes("/platform")) return {};

  const collection = collectionFor(parts);
  if (collection) {
    const id = parts[parts.length - 1];
    if (id && id !== parts[parts.length - 2] && id.startsWith("demo-"))
      return byId(collection as Array<{ _id: string }>, id);
  }
  return null;
}

function create(path: string, init: DemoRequestInit): unknown {
  const parts = pathParts(path);
  const payload = bodyOf(init);
  const id = `demo-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
  const common = {
    ...payload,
    _id: id,
    organizationId: demoOrganization._id,
  } as Record<string, unknown>;
  if (parts.includes("notifications") && parts.includes("read")) {
    const notificationId = idFromPath(parts, "notifications");
    const notification = notificationId
      ? state.notifications.find((item) => item._id === notificationId)
      : undefined;
    if (!notification) throw new Error("Notification not found.");
    notification.status = "READ";
    notification.readAt = new Date().toISOString();
    return notification;
  }
  if (parts.includes("provider-initiate"))
    return {
      status: "SIMULATED",
      provider: "DEMO",
      providerTransactionId: id,
      customerMessage: "Demo only. No payment request was sent.",
    };
  if (parts.includes("payment-destinations") && parts.includes("disable")) {
    const destination = state.paymentDestinations.find(
      (item) => item._id === idFromPath(parts, "payment-destinations"),
    );
    if (!destination) throw new Error("Payment destination not found.");
    destination.status = "DISABLED";
    destination.isDefault = false;
    return destination;
  }
  if (parts.includes("payment-destinations")) {
    const destination = {
      ...common,
      status: "PENDING_PROVIDER_SETUP",
      createdAt: new Date().toISOString(),
      ...(payload.provider === "PAYSTACK"
        ? {
            accountName: payload.businessName,
            accountNumberLast4: String(payload.accountNumber ?? "").slice(-4),
          }
        : payload.provider === "MPESA"
          ? {
              mpesaShortCode: payload.shortCode,
              mpesaAccountReference: payload.accountReference,
            }
          : {
              cryptoAsset: payload.asset,
              cryptoNetwork: payload.network,
              cryptoWalletAddress: payload.walletAddress,
            }),
    };
    state.paymentDestinations.push(destination);
    return destination;
  }
  if (parts.includes("tenant-onboarding")) {
    const unit = state.units.find(
      (item) => item._id === payload.unitId && item.status === "VACANT",
    );
    if (!unit) throw new Error("Choose a vacant unit for demo onboarding.");
    unit.status = "RESERVED";
    return {
      onboardingId: id,
      status: "PRE_REGISTERED",
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    };
  }
  if (parts.includes("maintenance") && parts.includes("evidence")) {
    const maintenanceId = idFromPath(parts, "maintenance");
    const request = maintenanceId
      ? state.maintenance.find((item) => item._id === maintenanceId)
      : undefined;
    if (!request) throw new Error("Maintenance request not found.");
    const files =
      typeof FormData !== "undefined" && init.body instanceof FormData
        ? init.body
            .getAll("media")
            .filter((item): item is File => item instanceof File)
        : [];
    if (!files.length) throw new Error("Select at least one photo or video.");
    const records = files.map((file, index) => ({
      _id: `demo-evidence-${Date.now()}-${index}`,
      organizationId: demoOrganization._id,
      propertyId: request.propertyId,
      buildingId: request.buildingId,
      floorId: request.floorId,
      unitId: request.unitId,
      ownerUserId: demoUserForRole(getDemoRole())._id,
      evidenceType: file.type.startsWith("video/") ? "VIDEO" : "PHOTO",
      source: "MOBILE",
      capturedAt: new Date().toISOString(),
      title: file.name,
      storageKey: `demo/maintenance/${request._id}/${file.name}`,
      mimeType: file.type,
      sizeBytes: file.size,
      relatedResourceType: "MAINTENANCE",
      relatedResourceId: request._id,
      metadata: { storageProvider: "DEMO" },
      createdAt: new Date().toISOString(),
    }));
    request.evidenceIds.push(...records.map((record) => record._id));
    request.updatedAt = new Date().toISOString();
    return records;
  }
  if (parts.includes("maintenance") && parts.includes("quote")) {
    const maintenanceId = idFromPath(parts, "maintenance");
    const request = maintenanceId
      ? state.maintenance.find((item) => item._id === maintenanceId)
      : undefined;
    if (!request) throw new Error("Maintenance request not found.");
    const amount = Number(payload.quoteAmount);
    request.quoteAmount = amount;
    request.approvalRequired = amount > 25000;
    request.status = request.approvalRequired
      ? "APPROVAL_REQUIRED"
      : "APPROVED";
    if (!request.approvalRequired) request.approvedAmount = amount;
    if (typeof payload.notes === "string")
      request.resolutionNotes = payload.notes;
    request.updatedAt = new Date().toISOString();
    return request;
  }
  if (parts.includes("maintenance") && parts.includes("progress")) {
    const maintenanceId = idFromPath(parts, "maintenance");
    const request = maintenanceId
      ? state.maintenance.find((item) => item._id === maintenanceId)
      : undefined;
    if (!request) throw new Error("Maintenance request not found.");
    request.status =
      payload.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS";
    if (typeof payload.actualAmount === "number")
      request.actualAmount = payload.actualAmount;
    if (typeof payload.resolutionNotes === "string")
      request.resolutionNotes = payload.resolutionNotes;
    if (request.status === "COMPLETED")
      request.completedAt = new Date().toISOString();
    request.updatedAt = new Date().toISOString();
    return request;
  }
  if (parts.includes("maintenance") && parts.includes("triage")) {
    const request = state.maintenance.find(
      (item) => item._id === idFromPath(parts, "maintenance"),
    );
    if (!request) throw new Error("Maintenance request not found.");
    request.priority =
      (payload.priority as typeof request.priority | undefined) ??
      request.priority;
    request.status = "TRIAGED";
    request.updatedAt = new Date().toISOString();
    return request;
  }
  if (parts.includes("maintenance") && parts.includes("assign")) {
    const request = state.maintenance.find(
      (item) => item._id === idFromPath(parts, "maintenance"),
    );
    if (!request) throw new Error("Maintenance request not found.");
    if (typeof payload.contractorId === "string")
      request.contractorId = payload.contractorId;
    request.status = "ASSIGNED";
    request.updatedAt = new Date().toISOString();
    return request;
  }
  if (parts.includes("maintenance") && parts.includes("approve")) {
    const request = state.maintenance.find(
      (item) => item._id === idFromPath(parts, "maintenance"),
    );
    if (!request) throw new Error("Maintenance request not found.");
    const approvedAmount =
      typeof payload.approvedAmount === "number"
        ? payload.approvedAmount
        : request.quoteAmount;
    if (approvedAmount !== undefined) request.approvedAmount = approvedAmount;
    request.status = "APPROVED";
    request.approvedAt = new Date().toISOString();
    request.updatedAt = new Date().toISOString();
    return request;
  }
  if (parts.includes("maintenance") && parts.includes("verify")) {
    const request = state.maintenance.find(
      (item) => item._id === idFromPath(parts, "maintenance"),
    );
    if (!request) throw new Error("Maintenance request not found.");
    request.status = "VERIFIED";
    request.verifiedAt = new Date().toISOString();
    request.updatedAt = new Date().toISOString();
    return request;
  }
  if (parts.includes("maintenance") && parts.includes("close")) {
    const request = state.maintenance.find(
      (item) => item._id === idFromPath(parts, "maintenance"),
    );
    if (!request) throw new Error("Maintenance request not found.");
    request.status = "CLOSED";
    request.closedAt = new Date().toISOString();
    request.updatedAt = new Date().toISOString();
    return request;
  }
  if (
    parts.includes("expenses") &&
    ["approve", "reject", "pay"].some((action) => parts.includes(action))
  ) {
    const expense = state.expenses.find(
      (item) => item._id === idFromPath(parts, "expenses"),
    );
    if (!expense) throw new Error("Expense not found.");
    expense.status = parts.includes("approve")
      ? "APPROVED"
      : parts.includes("reject")
        ? "REJECTED"
        : "PAID";
    expense.updatedAt = new Date().toISOString();
    return expense;
  }
  if (parts.includes("tenancies") && parts.includes("activate")) {
    const tenancy = state.tenancies.find(
      (item) => item._id === idFromPath(parts, "tenancies"),
    );
    if (!tenancy) throw new Error("Tenancy not found.");
    tenancy.status = "ACTIVE";
    tenancy.activatedAt = new Date().toISOString();
    tenancy.updatedAt = new Date().toISOString();
    return tenancy;
  }
  if (parts.includes("inspections") && parts.includes("complete")) {
    const inspection = state.inspections.find(
      (item) => item._id === idFromPath(parts, "inspections"),
    );
    if (!inspection) throw new Error("Inspection not found.");
    if (typeof payload.overallCondition === "string")
      inspection.overallCondition = payload.overallCondition as NonNullable<
        typeof inspection.overallCondition
      >;
    if (typeof payload.notes === "string") inspection.notes = payload.notes;
    inspection.status = "COMPLETED";
    inspection.completedAt = new Date().toISOString();
    inspection.updatedAt = new Date().toISOString();
    return inspection;
  }
  if (parts.includes("inspections")) {
    const unit = state.units.find((item) => item._id === payload.unitId);
    if (!unit) throw new Error("Choose a valid unit for the inspection.");
    const inspection = {
      ...common,
      propertyId: unit.propertyId,
      buildingId: unit.buildingId,
      floorId: unit.floorId,
      unitId: unit._id,
      status: "DRAFT",
      checklist: payload.checklist ?? [],
      meterReadings: payload.meterReadings ?? [],
      evidenceIds: payload.evidenceIds ?? [],
      inspectedBy: demoUserForRole(getDemoRole())._id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as (typeof state.inspections)[number];
    state.inspections.push(inspection);
    return inspection;
  }
  if (parts.includes("incidents")) {
    const unit = state.units.find((item) => item._id === payload.unitId);
    if (!unit) throw new Error("Choose a valid incident location.");
    const incident = {
      ...common,
      propertyId: unit.propertyId,
      buildingId: unit.buildingId,
      floorId: unit.floorId,
      unitId: unit._id,
      incidentNumber: `INC-DEMO-${Date.now()}`,
      status: "OPEN",
      reportedAt: payload.reportedAt ?? new Date().toISOString(),
      sourceEventIds: payload.sourceEventIds ?? [],
      evidenceIds: payload.evidenceIds ?? [],
      documentIds: payload.documentIds ?? [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as (typeof state.incidents)[number];
    state.incidents.push(incident);
    return incident;
  }
  if (parts.includes("inventory")) {
    const unit = state.units.find((item) => item._id === payload.unitId);
    if (!unit) throw new Error("Choose a valid asset location.");
    const asset = {
      ...common,
      propertyId: unit.propertyId,
      buildingId: unit.buildingId,
      floorId: unit.floorId,
      unitId: unit._id,
      assetTag: String(payload.assetTag ?? "").toUpperCase(),
      status: "ACTIVE",
      evidenceIds: payload.evidenceIds ?? [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as (typeof state.inventory)[number];
    state.inventory.push(asset);
    return asset;
  }
  if (parts.includes("maintenance")) {
    const unit = state.units.find((item) => item._id === payload.unitId);
    if (!unit) throw new Error("The selected unit is unavailable.");
    const request = {
      ...common,
      propertyId: unit.propertyId,
      buildingId: unit.buildingId,
      floorId: unit.floorId,
      reportedByUserId: demoUserForRole(getDemoRole())._id,
      priority: payload.priority ?? "MEDIUM",
      status: "NEW",
      evidenceIds: payload.evidenceIds ?? [],
      approvalRequired: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as (typeof state.maintenance)[number];
    state.maintenance.push(request);
    return request;
  }
  if (parts.includes("payments")) {
    const tenancy = state.tenancies.find(
      (item) => item._id === payload.tenancyId,
    );
    if (!tenancy) throw new Error("The selected tenancy is unavailable.");
    const payment = {
      ...common,
      propertyId: tenancy.propertyId,
      buildingId: tenancy.buildingId,
      floorId: tenancy.floorId,
      unitId: tenancy.unitId,
      tenantId: tenancy.tenantId,
      currency: payload.currency ?? "KES",
      status: "PENDING",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as (typeof state.payments)[number];
    state.payments.push(payment);
    return payment;
  }
  if (parts.includes("cameras")) {
    const camera = { ...common, status: "OFFLINE", capabilities: [] };
    (state.cameras as unknown[]).push(camera);
    return camera;
  }
  if (parts.includes("properties")) common.status = "ACTIVE";
  const map: Array<[string, unknown[]]> = [
    ["properties", state.properties],
    ["buildings", state.buildings],
    ["floors", state.floors],
    ["units", state.units],
    ["tenants", state.tenants],
    ["tenancies", state.tenancies],
    ["rent", state.rent],
    ["payments", state.payments],
    ["expenses", state.expenses],
    ["maintenance", state.maintenance],
    ["contractors", state.contractors],
    ["documents", state.documents],
    ["incidents", state.incidents],
    ["inventory", state.inventory],
  ];
  const match = map.find(([segment]) => parts.includes(segment));
  if (match) {
    (match[1] as unknown[]).push(common);
    return common;
  }
  if (path.includes("/decision-automation/evaluate"))
    return { evaluated: true, actionsCreated: 0, demo: true };
  if (path.includes("/decision-automation/bootstrap"))
    return { policy: getDemoDecisionPolicy(), scheduled: true };
  if (path.includes("/integrations/payments/"))
    return { status: "SIMULATED", provider: "DEMO", reference: id };
  if (
    path.includes("/integrations/organizations/") &&
    path.includes("/storage/signed-url")
  )
    return {
      signedUrl: "https://demo.invalid/signed-url",
      expiresAt: new Date(Date.now() + 900000).toISOString(),
    };
  return common;
}

function update(path: string, init: DemoRequestInit): unknown {
  const parts = pathParts(path);
  const id = parts[parts.length - 1];
  const payload = bodyOf(init);
  if (parts[0] === "organizations" && parts[1] === demoOrganization._id) {
    if (typeof payload.name === "string") demoOrganization.name = payload.name;
    if (typeof payload.slug === "string") demoOrganization.slug = payload.slug;
    if (payload.settings && typeof payload.settings === "object")
      demoOrganization.settings = {
        ...demoOrganization.settings,
        ...(payload.settings as Record<string, string>),
      };
    return demoOrganization;
  }
  if (parts.includes("intelligence") && parts.includes("alerts")) {
    const alert = state.intelligenceAlerts.find(
      (item) => item._id === idFromPath(parts, "alerts"),
    );
    if (!alert) throw new Error("Intelligence alert not found.");
    if (typeof payload.status === "string")
      alert.status = payload.status as typeof alert.status;
    return alert;
  }
  const collection = collectionFor(parts) as Array<
    Record<string, unknown>
  > | null;
  if (collection && id) {
    const index = collection.findIndex((item) => item._id === id);
    if (index >= 0) {
      collection[index] = { ...collection[index], ...payload };
      return collection[index];
    }
  }
  return { ...payload, _id: id, organizationId: demoOrganization._id };
}

function getDemoDecisionPolicy() {
  return {
    _id: "demo-decision-policy",
    organizationId: demoOrganization._id,
    enabled: true,
    evaluationIntervalMinutes: 30,
    escalationAfterMinutes: 60,
    notifyPriority: "HIGH",
    forecastHorizonDays: 30,
    maxNotificationsPerRun: 20,
  };
}

export async function demoApi<T>(
  path: string,
  init: DemoRequestInit = {},
): Promise<T> {
  if (!DEV_DEMO_MODE)
    throw new Error("Development demo data mode is disabled.");
  const method = (init.method ?? "GET").toUpperCase();
  let value: unknown;
  if (method === "GET") value = get(path);
  else if (method === "POST" || method === "PUT") value = create(path, init);
  else if (method === "PATCH") value = update(path, init);
  else if (method === "DELETE") value = { deleted: true };
  else value = null;

  if (value === null) {
    throw new Error(`No demo data route for ${method} ${path}`);
  }

  return json(value as T);
}

export function demoIdentity() {
  const role = getDemoRole();
  const user = demoUserForRole(role);
  return {
    user: {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      status: "ACTIVE",
      isPlatformAdmin: role === "SUPER_ADMIN",
    },
    roles: [role],
    memberships: [
      {
        organizationId: demoOrganization._id,
        roleIds: [`demo-role-${role.toLowerCase()}`],
        roles: [role],
        permissions: ["*"],
        status: "ACTIVE",
        scope: {
          allProperties: role === "SUPER_ADMIN" || role === "LANDLORD",
          propertyIds: ROLE_PROPERTY_SCOPE[role] ?? [],
          buildingIds: ROLE_BUILDING_SCOPE[role] ?? [],
          unitIds: ROLE_UNIT_SCOPE[role] ?? [],
        },
      },
    ],
  };
}
