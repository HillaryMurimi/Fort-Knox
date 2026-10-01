import type { HealthGrade } from "../../types/api";

export interface Property {
  _id: string;
  organizationId: string;
  name: string;
  code: string;
  description?: string;
  propertyType:
    | "APARTMENT"
    | "RESIDENTIAL_ESTATE"
    | "COMMERCIAL"
    | "MIXED_USE"
    | "OFFICE"
    | "RETAIL"
    | "WAREHOUSE"
    | "OTHER";
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  address: {
    addressLine1: string;
    addressLine2?: string;
    city: string;
    county?: string;
    country: string;
    postalCode?: string;
  };
  location?: { type: "Point"; coordinates: [number, number] };
  totalUnits?: number;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface Building {
  _id: string;
  organizationId: string;
  propertyId: string;
  name: string;
  code: string;
  description?: string;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  totalFloors?: number;
  totalUnits?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Floor {
  _id: string;
  organizationId: string;
  propertyId: string;
  buildingId: string;
  name: string;
  level: number;
  code: string;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  totalUnits?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Unit {
  _id: string;
  organizationId: string;
  propertyId: string;
  buildingId: string;
  floorId: string;
  name: string;
  code: string;
  unitType:
    | "SINGLE_ROOM"
    | "BEDSITTER"
    | "STUDIO"
    | "ONE_BEDROOM"
    | "TWO_BEDROOM"
    | "THREE_PLUS_BEDROOM"
    | "FOUR_BEDROOM"
    | "FIVE_PLUS_BEDROOM"
    | "MAISONETTE"
    | "SHOP"
    | "OFFICE"
    | "RETAIL"
    | "COMMERCIAL_UNIT"
    | "OTHER";
  unitTypeLabel?: string;
  status: "VACANT" | "OCCUPIED" | "RESERVED" | "MAINTENANCE" | "INACTIVE";
  monthlyRent: number;
  serviceCharge?: number;
  areaSqm?: number;
  bedrooms?: number;
  bathrooms?: number;
  amenities?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Tenant {
  _id: string;
  organizationId: string;
  userId: string;
  status: "PROSPECT" | "ACTIVE" | "INACTIVE" | "BLACKLISTED";
  nationalIdLast4?: string;
  dateOfBirth?: string;
  emergencyContact?: { name: string; phone: string; relationship: string };
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Tenancy {
  _id: string;
  organizationId: string;
  propertyId: string;
  buildingId: string;
  floorId: string;
  unitId: string;
  tenantId: string;
  status:
    "DRAFT" | "PENDING" | "ACTIVE" | "NOTICE" | "MOVED_OUT" | "TERMINATED";
  leaseNumber: string;
  startDate: string;
  endDate?: string;
  monthlyRent: number;
  serviceCharge?: number;
  depositAmount?: number;
  billingDay: number;
  noticePeriodDays: number;
  signedLeaseDocumentId?: string;
  notes?: string;
  activatedAt?: string;
  movedOutAt?: string;
  terminatedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RentCharge {
  _id: string;
  organizationId: string;
  propertyId: string;
  buildingId: string;
  floorId: string;
  unitId: string;
  tenantId: string;
  tenancyId: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  rentAmount: number;
  serviceChargeAmount: number;
  adjustments: number;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  currency: string;
  status: "OPEN" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "VOID";
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Payment {
  _id: string;
  organizationId: string;
  propertyId: string;
  buildingId: string;
  floorId: string;
  unitId: string;
  tenantId: string;
  tenancyId: string;
  amount: number;
  currency: string;
  method: "MPESA" | "BANK_TRANSFER" | "CARD" | "CASH" | "CHEQUE" | "OTHER";
  status: "PENDING" | "CONFIRMED" | "FAILED" | "REVERSED";
  provider?: string;
  providerTransactionId?: string;
  receiptNumber?: string;
  paidAt?: string;
  confirmedAt?: string;
  reversedAt?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PaymentRefund {
  _id: string;
  organizationId: string;
  paymentId: string;
  provider: 'PAYSTACK';
  transactionReference: string;
  providerRefundId?: number;
  amountMinorUnits: number;
  currency: string;
  status: 'SUBMITTING' | 'SUBMISSION_UNKNOWN' | 'PENDING' | 'PROCESSING' | 'NEEDS_ATTENTION' | 'FAILED' | 'PROCESSED';
  reason: string;
  lastReviewedAt?: string;
  lastReviewNote?: string;
  ledgerReversedAt?: string;
  createdAt: string;
  providerUpdatedAt?: string;
}

export interface PaymentDestination {
  _id: string;
  organizationId: string;
  provider: "PAYSTACK" | "MPESA" | "CRYPTO";
  label: string;
  status: "PENDING_PROVIDER_SETUP" | "ACTIVE" | "DISABLED";
  isDefault: boolean;
  currency: string;
  country?: string;
  paystackSubaccountCode?: string;
  settlementBankCode?: string;
  accountName?: string;
  accountNumberLast4?: string;
  mpesaShortCode?: string;
  mpesaAccountReference?: string;
  cryptoAsset?: string;
  cryptoNetwork?: string;
  cryptoWalletAddress?: string;
  providerVerifiedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Expense {
  _id: string;
  organizationId: string;
  propertyId: string;
  buildingId?: string;
  floorId?: string;
  unitId?: string;
  category:
    | "MAINTENANCE"
    | "UTILITIES"
    | "SECURITY"
    | "CLEANING"
    | "INSURANCE"
    | "TAX"
    | "STAFF"
    | "MANAGEMENT"
    | "SUPPLIES"
    | "LEGAL"
    | "MARKETING"
    | "OTHER";
  description: string;
  amount: number;
  currency: string;
  incurredAt: string;
  paidAt?: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "PAID" | "REJECTED" | "VOID";
  vendorName?: string;
  contractorId?: string;
  maintenanceRequestId?: string;
  sourceType: "MANUAL" | "MAINTENANCE";
  sourceId: string;
  evidenceIds: string[];
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ServiceChargeAssessment {
  _id: string;
  organizationId: string;
  propertyId: string;
  buildingId: string;
  floorId: string;
  unitId: string;
  tenantId: string;
  tenancyId: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  currency: string;
  status: "ASSESSED" | "INVOICED" | "PAID" | "VOID";
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ArrearsCase {
  _id: string;
  organizationId: string;
  propertyId: string;
  buildingId: string;
  floorId: string;
  unitId: string;
  tenantId: string;
  tenancyId: string;
  rentChargeIds: string[];
  amountOutstanding: number;
  currency: string;
  status:
    | "OPEN"
    | "CONTACTED"
    | "PROMISED"
    | "ESCALATED"
    | "RESOLVED"
    | "WRITTEN_OFF";
  promiseDate?: string;
  lastContactedAt?: string;
  resolvedAt?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface FinancialReport {
  rentBilled: number;
  serviceChargesBilled: number;
  totalBilled: number;
  totalCollected: number;
  collectionRate: number;
  outstanding: number;
  expensesByCategory: Record<string, number>;
  totalExpenses: number;
  accrualPnl: number;
  cashPnl: number;
  arrearsAmount: number;
  arrearsCount: number;
  serviceChargeAssessed: number;
  activeTenancyCount: number;
  paymentCount: number;
}

export interface FinancialPeriod {
  _id: string;
  organizationId: string;
  periodStart: string;
  periodEnd: string;
  status: "OPEN" | "CLOSED" | "LOCKED";
  closedAt?: string;
  closedBy?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ContractorPerformance {
  totalJobs: number;
  completedJobs: number;
  completionRate: number;
  averageCompletionHours: number;
  overBudgetJobs: number;
  overBudgetRate: number;
}
export interface Contractor {
  _id: string;
  organizationId: string;
  userId?: string;
  name: string;
  phone?: string;
  email?: string;
  trade: string;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  rating: number;
  notes?: string;
  metadata?: Record<string, unknown>;
  performance?: ContractorPerformance;
  createdAt?: string;
  updatedAt?: string;
}

export interface MaintenanceRequest {
  _id: string;
  organizationId: string;
  propertyId: string;
  buildingId: string;
  floorId: string;
  unitId: string;
  tenantId?: string;
  reportedByUserId: string;
  assignedToUserId?: string;
  contractorId?: string;
  title: string;
  description: string;
  category:
    | "PLUMBING"
    | "ELECTRICAL"
    | "STRUCTURAL"
    | "SECURITY"
    | "CLEANING"
    | "APPLIANCE"
    | "HVAC"
    | "PEST_CONTROL"
    | "OTHER";
  priority: "EMERGENCY" | "HIGH" | "MEDIUM" | "LOW";
  status:
    | "NEW"
    | "TRIAGED"
    | "ASSIGNED"
    | "QUOTED"
    | "APPROVAL_REQUIRED"
    | "APPROVED"
    | "IN_PROGRESS"
    | "COMPLETED"
    | "VERIFIED"
    | "CLOSED"
    | "CANCELLED";
  evidenceIds: string[];
  quoteAmount?: number;
  approvedAmount?: number;
  actualAmount?: number;
  approvalRequired: boolean;
  approvedBy?: string;
  approvedAt?: string;
  completedAt?: string;
  verifiedAt?: string;
  closedAt?: string;
  resolutionNotes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MaintenanceApprovalPolicy {
  _id: string;
  organizationId: string;
  approvalThreshold: number;
  emergencyAutoApprove: boolean;
  autoApproveRoles: string[];
  currency: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Inspection {
  _id: string;
  organizationId: string;
  propertyId: string;
  buildingId: string;
  floorId: string;
  unitId: string;
  tenancyId?: string;
  maintenanceRequestId?: string;
  type:
    "MOVE_IN" | "MOVE_OUT" | "ROUTINE" | "MAINTENANCE" | "SAFETY" | "INVENTORY";
  status: "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "VOID";
  overallCondition?: "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "DAMAGED";
  checklist: Array<{
    item: string;
    condition:
      "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "DAMAGED" | "NOT_APPLICABLE";
    notes?: string;
    evidenceIds: string[];
  }>;
  meterReadings: Array<{ meterType: string; reading: number; unit?: string }>;
  notes?: string;
  evidenceIds: string[];
  inspectedBy: string;
  completedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface InventoryItem {
  _id: string;
  organizationId: string;
  propertyId: string;
  buildingId: string;
  floorId: string;
  unitId: string;
  assetTag: string;
  name: string;
  category: string;
  serialNumber?: string;
  condition: "NEW" | "GOOD" | "FAIR" | "POOR" | "DAMAGED" | "DISPOSED";
  status: "ACTIVE" | "MISSING" | "UNDER_REPAIR" | "DISPOSED";
  purchaseCost?: number;
  purchaseDate?: string;
  warrantyExpiry?: string;
  maintenanceIntervalDays?: number;
  lastServicedAt?: string;
  nextServiceDueAt?: string;
  notes?: string;
  evidenceIds: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SecurityCamera {
  _id: string;
  organizationId: string;
  propertyId: string;
  buildingId?: string;
  floorId?: string;
  unitId?: string;
  name: string;
  cameraCode: string;
  provider: string;
  connectionType: "RTSP" | "ONVIF" | "HTTP" | "SDK" | "NVR" | "CLOUD";
  status: "ONLINE" | "OFFLINE" | "DEGRADED" | "MAINTENANCE" | "DISABLED";
  capabilities: string[];
  streamRef?: string;
  playbackRef?: string;
  lastSeenAt?: string;
  lastHeartbeatAt?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface SecurityEvent {
  _id: string;
  organizationId: string;
  propertyId: string;
  buildingId?: string;
  floorId?: string;
  unitId?: string;
  cameraId?: string;
  type:
    | "MOTION"
    | "PERSON_DETECTED"
    | "VEHICLE_DETECTED"
    | "INTRUSION"
    | "TAMPER"
    | "CAMERA_OFFLINE"
    | "CAMERA_ONLINE"
    | "AUDIO"
    | "FIRE"
    | "SMOKE"
    | "PANIC"
    | "ACCESS_DENIED"
    | "SYSTEM";
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "ACKNOWLEDGED" | "ESCALATED" | "RESOLVED" | "DISMISSED";
  detectedAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  source:
    "CCTV" | "ACCESS_CONTROL" | "SENSOR" | "USER" | "SYSTEM" | "INTEGRATION";
  confidence?: number;
  snapshotEvidenceIds: string[];
  description?: string;
  metadata?: Record<string, unknown>;
  acknowledgedBy?: string;
  resolvedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SecuritySummary {
  criticalOpenEvents: number;
  highOpenEvents: number;
  totalOpenEvents: number;
  offlineCameras: number;
  deniedAccessEvents24h: number;
}

export interface Incident {
  _id: string;
  organizationId: string;
  propertyId: string;
  buildingId?: string;
  floorId?: string;
  unitId?: string;
  incidentNumber: string;
  title: string;
  description?: string;
  category:
    | "SECURITY"
    | "THEFT"
    | "TRESPASS"
    | "VANDALISM"
    | "FIRE"
    | "SAFETY"
    | "ASSAULT"
    | "ACCESS_CONTROL"
    | "OTHER";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status:
    | "OPEN"
    | "INVESTIGATING"
    | "CONTAINED"
    | "RESOLVED"
    | "CLOSED"
    | "FALSE_ALARM";
  reportedAt: string;
  containedAt?: string;
  resolvedAt?: string;
  closedAt?: string;
  sourceEventIds: string[];
  evidenceIds: string[];
  documentIds: string[];
  assignedToUserId?: string;
  resolutionNotes?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface AccessPoint {
  _id: string;
  organizationId: string;
  propertyId: string;
  buildingId?: string;
  floorId?: string;
  unitId?: string;
  name: string;
  pointCode: string;
  type:
    | "MAIN_GATE"
    | "PEDESTRIAN_GATE"
    | "DOOR"
    | "TURNSTILE"
    | "LIFT"
    | "PARKING"
    | "OTHER";
  status: "ACTIVE" | "OFFLINE" | "DISABLED" | "MAINTENANCE";
  provider?: string;
  deviceRef?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface AccessEvent {
  _id: string;
  organizationId: string;
  propertyId: string;
  buildingId?: string;
  floorId?: string;
  unitId?: string;
  accessPointId: string;
  userId?: string;
  tenantId?: string;
  eventType:
    | "ENTRY"
    | "EXIT"
    | "ACCESS_DENIED"
    | "FORCED_OPEN"
    | "DOOR_HELD"
    | "CREDENTIAL_REVOKED"
    | "SYSTEM";
  decision: "GRANTED" | "DENIED" | "UNKNOWN";
  credentialType:
    | "CARD"
    | "PIN"
    | "BIOMETRIC"
    | "MOBILE"
    | "QR"
    | "MANUAL"
    | "PLATE"
    | "UNKNOWN";
  occurredAt: string;
  credentialRef?: string;
  reason?: string;
  evidenceIds: string[];
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface DocumentRecord {
  _id: string;
  organizationId: string;
  propertyId?: string;
  buildingId?: string;
  floorId?: string;
  unitId?: string;
  ownerUserId?: string;
  title: string;
  description?: string;
  category:
    | "LEASE"
    | "INSPECTION"
    | "MAINTENANCE"
    | "INVOICE"
    | "RECEIPT"
    | "IDENTITY"
    | "PROPERTY"
    | "TENANCY"
    | "MOVE_OUT"
    | "INSURANCE"
    | "LEGAL"
    | "FINANCIAL"
    | "OTHER";
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageProvider: "LOCAL" | "S3" | "CLOUDINARY" | "OTHER";
  storageKey: string;
  sha256: string;
  version: number;
  visibility: "STAFF" | "TENANT" | "PRIVATE";
  status: "ACTIVE" | "ARCHIVED" | "QUARANTINED";
  tags: string[];
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface EvidenceRecord {
  _id: string;
  organizationId: string;
  propertyId?: string;
  buildingId?: string;
  floorId?: string;
  unitId?: string;
  ownerUserId?: string;
  documentId?: string;
  evidenceType:
    | "PHOTO"
    | "VIDEO"
    | "AUDIO"
    | "DOCUMENT"
    | "SCREENSHOT"
    | "METER_READING"
    | "SIGNATURE"
    | "OTHER";
  source: "MOBILE" | "WEB" | "CCTV" | "SYSTEM" | "API" | "OTHER";
  capturedAt: string;
  title?: string;
  description?: string;
  storageKey?: string;
  sha256?: string;
  mimeType?: string;
  sizeBytes?: number;
  relatedResourceType:
    | "MAINTENANCE"
    | "INSPECTION"
    | "MOVE_OUT"
    | "TENANCY"
    | "EXPENSE"
    | "PAYMENT"
    | "ARREARS"
    | "PROPERTY"
    | "UNIT"
    | "SECURITY_EVENT"
    | "OTHER";
  relatedResourceId: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface AuditLogRecord {
  _id: string;
  organizationId?: string;
  actorUserId?: string;
  actorRole?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  propertyId?: string;
  buildingId?: string;
  unitId?: string;
  requestId?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  occurredAt: string;
}

export interface DomainEventRecord {
  _id: string;
  eventId: string;
  organizationId: string;
  name: string;
  aggregateType: string;
  aggregateId: string;
  actorUserId?: string;
  actorRole?: string;
  requestId?: string;
  source?: 'APPLICATION' | 'PROVIDER' | 'SYSTEM';
  correlationId?: string;
  causationId?: string;
  version: number;
  schemaVersion?: number;
  payload: unknown;
  occurredAt: string;
  publishedAt?: string;
}

export interface PropertyHealth {
  property: {
    _id: string;
    name: string;
    code: string;
    propertyType: string;
    address: Record<string, unknown>;
  };
  health: {
    score: number;
    grade: HealthGrade;
    warningCodes: string[];
    dimensions: Record<string, unknown>;
  };
  metrics: {
    propertyId: string;
    units: number;
    occupiedUnits: number;
    vacantUnits: number;
    reservedUnits: number;
    maintenanceUnits: number;
    occupancyRate: number;
    rentBilled: number;
    rentCollected: number;
    cashCollected: number;
    collectionRate: number;
    outstandingRent: number;
    arrearsCases: number;
    arrearsAmount: number;
    expenses: number;
    expenseRatio: number;
    maintenanceOpen: number;
    urgentMaintenance: number;
    maintenanceSpend: number;
    inspectionCoverage: number;
    inventoryItems: number;
    inventoryServiceDue: number;
    cameras: number;
    camerasOnline: number;
    openSecurityEvents: number;
    highCriticalSecurityEvents: number;
    openIncidents: number;
    criticalIncidents: number;
    accessDenied24h: number;
  };
  actions: Array<{
    priority: "CRITICAL" | "HIGH" | "MEDIUM";
    code: string;
    title: string;
    reason: string;
  }>;
}

export interface IntelligenceAlert {
  _id: string;
  organizationId: string;
  propertyId: string;
  code: string;
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED";
  title: string;
  message: string;
  source:
    | "FINANCE"
    | "OPERATIONS"
    | "SECURITY"
    | "OCCUPANCY"
    | "COMPLIANCE"
    | "INTELLIGENCE";
  metric: string;
  observedValue?: number;
  thresholdValue?: number;
  firstDetectedAt: string;
  lastDetectedAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface HealthHistoryPoint {
  _id?: string;
  propertyId: string;
  asOf: string;
  periodStart: string;
  periodEnd: string;
  score: number;
  grade: HealthGrade;
  dimensions: {
    financial: {
      score: number;
      weight: number;
      weightedScore: number;
      signals: string[];
    };
    operational: {
      score: number;
      weight: number;
      weightedScore: number;
      signals: string[];
    };
    security: {
      score: number;
      weight: number;
      weightedScore: number;
      signals: string[];
    };
  };
  metrics: Record<string, unknown>;
  warningCodes: string[];
  createdAt?: string;
}

export interface NotificationRecord {
  _id: string;
  organizationId: string;
  recipientUserId: string;
  channel: "IN_APP" | "EMAIL" | "SMS" | "PUSH" | "WHATSAPP";
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  status: "QUEUED" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "CANCELLED";
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  scheduledFor?: string;
  sentAt?: string;
  readAt?: string;
  failureReason?: string;
  dedupeKey?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface NotificationPreference {
  _id?: string;
  organizationId: string;
  userId: string;
  eventType: string;
  channels: NotificationRecord["channel"][];
  enabled: boolean;
}

export interface JobRecord {
  _id: string;
  organizationId?: string;
  type: string;
  payload: unknown;
  status:
    "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "DEAD_LETTER";
  priority: number;
  attempts: number;
  maxAttempts: number;
  availableAt: string;
  lockedAt?: string;
  lockedBy?: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  lastError?: string;
  result?: unknown;
  dedupeKey?: string;
  deadLetteredAt?: string;
  leaseExpiresAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Paginated<T> {
  data: T[];
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  };
}

export interface DecisionAutomationPolicy {
  _id: string;
  organizationId: string;
  enabled: boolean;
  evaluationIntervalMinutes: number;
  escalationAfterMinutes: number;
  notifyPriority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  forecastHorizonDays: number;
  maxNotificationsPerRun: number;
  lastEvaluatedAt?: string;
  lastScheduledAt?: string;
  updatedAt?: string;
}

export interface LandlordAction {
  _id: string;
  organizationId: string;
  propertyId: string;
  code: string;
  title: string;
  reason: string;
  recommendedAction: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  status: "OPEN" | "ACKNOWLEDGED" | "IN_PROGRESS" | "RESOLVED" | "DISMISSED";
  source:
    | "FINANCE"
    | "OCCUPANCY"
    | "MAINTENANCE"
    | "SECURITY"
    | "COMPLIANCE"
    | "ANOMALY"
    | "RISK"
    | "INTELLIGENCE";
  targetResourceType?: string;
  targetResourceId?: string;
  urgencyScore: number;
  financialImpact: number;
  moneyAtRisk: number;
  confidence: number;
  detectedAt: string;
  dueAt?: string;
  lastEvaluatedAt?: string;
  modelSource?: "RULE" | "ML_CHAMPION" | "ML_CHALLENGER";
  modelVersion?: string;
  mlInfluenced?: boolean;
  escalationLevel: number;
  escalatedAt?: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface TenantArrearsRisk {
  _id: string;
  organizationId: string;
  propertyId: string;
  buildingId: string;
  floorId: string;
  unitId: string;
  tenantId: string;
  tenancyId: string;
  asOf: string;
  score: number;
  grade: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  probability: number;
  outstandingAmount: number;
  monthlyObligation: number;
  daysPastDue: number;
  paymentConsistency: number;
  trendVelocity: number;
  drivers: Array<{ code: string; label: string; impact: number }>;
  confidence: number;
  modelVersion: string;
}

export interface VacancyForecast {
  _id: string;
  organizationId: string;
  propertyId: string;
  buildingId: string;
  floorId: string;
  unitId: string;
  asOf: string;
  currentVacancyDays: number;
  historicalMedianDays: number;
  historicalSampleSize: number;
  predictedDaysToLease: number;
  predictedLeaseDate?: string;
  monthlyRent: number;
  revenueAtRisk: number;
  confidence: number;
  modelVersion: string;
  drivers: Array<{ code: string; label: string; impact: number }>;
}

export interface RevenueRiskForecast {
  modelVersion: string;
  modelSource?: "RULE" | "ML_CHAMPION" | "ML_CHALLENGER";
  mlInfluenced?: boolean;
  horizonDays: number;
  baselineMonthlyRevenue: number;
  expectedRevenue: number;
  revenueAtRisk: number;
  vacancyRiskAmount: number;
  arrearsRiskAmount: number;
  collectionRiskAmount: number;
  maintenanceRiskAmount: number;
  healthVelocity: number;
  confidence: number;
  drivers: Array<{ code: string; label: string; impact: number }>;
}

export interface PredictiveModel {
  _id: string;
  organizationId: string;
  domain: "ARREARS" | "VACANCY" | "REVENUE";
  version: string;
  modelType: string;
  featureNames: string[];
  metrics?: {
    sampleCount?: number;
    trainCount?: number;
    validationCount?: number;
    auc?: number;
    brierScore?: number;
    recall?: number;
    rmse?: number;
    r2?: number;
    [key: string]: number | undefined;
  };
  validationPassed: boolean;
  status: "CANDIDATE" | "VALIDATED" | "PROMOTED" | "RETIRED";
  trainedAt?: string;
  promotedAt?: string;
}

export interface DecisionAutomationOverview {
  asOf: string;
  modelVersion: string;
  portfolio: {
    propertyCount: number;
    openActions: number;
    criticalActions: number;
    totalMoneyAtRisk: number;
    highRiskTenants: number;
    prolongedVacancies: number;
  };
  trendVelocity: {
    healthScoreVelocity: number;
    propertiesWithNegativeVelocity: number;
    propertyCount: number;
  };
  actions: LandlordAction[];
  tenantRisks: TenantArrearsRisk[];
  vacancyForecasts: VacancyForecast[];
  revenueForecasts: RevenueRiskForecast[];
}

export interface ModelServingPolicy {
  _id: string;
  organizationId: string;
  enabled: boolean;
  mode: "SHADOW" | "CANARY" | "ACTIVE";
  canaryPercent: number;
  minConfidence: number;
  mlActionMinConfidence: number;
  requireValidation: boolean;
  maxDriftPsi: number;
  maxPerformanceDegradation: number;
  autoRollbackOnCriticalDrift: boolean;
  autoRollbackOnPerformanceDegradation: boolean;
  approvalValidityHours: number;
  domains: { ARREARS?: boolean; VACANCY?: boolean; REVENUE?: boolean };
  updatedAt?: string;
  lastEvaluatedAt?: string;
}

export interface ModelDeployment {
  _id: string;
  organizationId: string;
  domain: "ARREARS" | "VACANCY" | "REVENUE";
  championModelId: string;
  challengerModelId?: string;
  mode: "SHADOW" | "CANARY" | "ACTIVE";
  canaryPercent: number;
  championVersion: string;
  challengerVersion?: string;
  championMetrics?: Record<string, number>;
  challengerMetrics?: Record<string, number>;
  activatedAt?: string;
  rolledBackAt?: string;
  rollbackReason?: string;
  updatedAt?: string;
}

export interface ModelMonitoringSnapshot {
  _id: string;
  organizationId: string;
  domain: "ARREARS" | "VACANCY" | "REVENUE";
  modelVersion: string;
  windowStart: string;
  windowEnd: string;
  predictionCount: number;
  outcomeCount: number;
  featureDrift?: Record<string, number>;
  maxPsi: number;
  performance?: Record<string, number>;
  baselinePerformance?: Record<string, number>;
  driftStatus: "HEALTHY" | "WARNING" | "CRITICAL";
  performanceStatus: "HEALTHY" | "WARNING" | "CRITICAL";
  overallStatus: "HEALTHY" | "WARNING" | "CRITICAL";
  recommendation: "KEEP" | "REVIEW" | "ROLLBACK" | "DISABLE";
  evaluatedAt: string;
}

export interface ModelActivationApproval {
  _id: string;
  organizationId: string;
  domain: "ARREARS" | "VACANCY" | "REVENUE";
  deploymentId: string;
  modelVersion: string;
  mode: "CANARY" | "ACTIVE";
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "REVOKED";
  requestedBy: string;
  approvedBy?: string;
  requestedAt: string;
  approvedAt?: string;
  expiresAt?: string;
  reason?: string;
}

export interface ModelSafetyIncident {
  _id: string;
  organizationId: string;
  domain: "ARREARS" | "VACANCY" | "REVENUE";
  modelVersion?: string;
  type:
    | "DRIFT"
    | "PERFORMANCE_DEGRADATION"
    | "LOW_CONFIDENCE"
    | "SERVING_ERROR"
    | "DATA_QUALITY"
    | "MANUAL_KILL_SWITCH";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED";
  detectedAt: string;
  resolvedAt?: string;
  title: string;
  description: string;
  metrics?: Record<string, number>;
}

export interface TrainingRunResult {
  domain: "ARREARS" | "VACANCY" | "REVENUE";
  status: string;
  sampleCount?: number;
  trainCount?: number;
  validationCount?: number;
  modelId?: string;
  version?: string;
  validationPassed?: boolean;
  metrics?: Record<string, number>;
}

export interface BillingPlan {
  _id: string;
  key: string;
  name: string;
  description?: string;
  currency: string;
  amount: number;
  billingInterval: "MONTH" | "QUARTER" | "YEAR";
  trialDays: number;
  entitlements: {
    maxProperties: number;
    maxUnits: number;
    maxUsers: number;
    maxTenants: number;
    features: string[];
  };
  active: boolean;
}

export interface BillingSubscription {
  _id: string;
  organizationId: string;
  planId: BillingPlan | string;
  status:
    "PENDING" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "PAUSED" | "CANCELLED" | "EXPIRED";
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEndsAt?: string;
  cancelAtPeriodEnd: boolean;
  pendingPlanId?: BillingPlan | string;
  pendingPlanEffectiveAt?: string;
  cancelledAt?: string;
  provider: "INTERNAL" | "MPESA" | "PAYSTACK" | "STRIPE" | "OTHER";
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  providerCheckoutUrl?: string;
  gracePeriodEndsAt?: string;
  metadata?: { prepaidMonths?: number };
}

export interface SubscriptionInvoice {
  _id: string;
  organizationId: string;
  subscriptionId: string;
  invoiceNumber: string;
  periodStart: string;
  periodEnd: string;
  subtotal: number;
  tax: number;
  total: number;
  amountPaid: number;
  currency: string;
  status: "DRAFT" | "OPEN" | "PAID" | "PAST_DUE" | "VOID" | "UNCOLLECTIBLE";
  dueDate: string;
  paidAt?: string;
  provider: "INTERNAL" | "MPESA" | "PAYSTACK" | "STRIPE" | "OTHER";
  lineItems: Array<{
    description?: string;
    quantity?: number;
    unitAmount?: number;
  }>;
}

export interface PaginatedInvoices {
  items: SubscriptionInvoice[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface BillingUsageSnapshot {
  periodStart: string;
  periodEnd: string;
  metrics: {
    PROPERTIES: number;
    UNITS: number;
    USERS: number;
    TENANTS: number;
  };
}

export interface BillingEntitlements {
  status: BillingSubscription["status"] | "UNSUBSCRIBED";
  plan: BillingPlan | null;
}
