export type HealthGrade = 'EXCELLENT' | 'GOOD' | 'WATCH' | 'AT_RISK' | 'CRITICAL';

export interface PropertyHealthDimensions {
  financial: { score: number; weight: number; weightedScore: number; signals: string[] };
  operational: { score: number; weight: number; weightedScore: number; signals: string[] };
  security: { score: number; weight: number; weightedScore: number; signals: string[] };
}

export interface PropertyHealthScore {
  score: number;
  grade: HealthGrade;
  warningCodes: string[];
  dimensions: PropertyHealthDimensions;
}

export interface PropertyMetrics {
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
}

export interface CommandCenterProperty {
  property: {
    _id: string;
    name: string;
    code: string;
    propertyType: string;
    address: Record<string, unknown>;
  };
  health: PropertyHealthScore;
  metrics: PropertyMetrics;
  actions: Array<{
    priority: 'CRITICAL' | 'HIGH' | 'MEDIUM';
    code: string;
    title: string;
    reason: string;
  }>;
}

export interface CommandCenterAlert {
  _id: string;
  organizationId: string;
  propertyId: string;
  code: string;
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  message: string;
  source: string;
  metric: string;
  observedValue?: number;
  thresholdValue?: number;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED';
  firstDetectedAt: string;
  lastDetectedAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CommandCenterPortfolio {
  propertyCount: number;
  healthScore: number;
  grade: HealthGrade;
  units: number;
  occupiedUnits: number;
  vacantUnits: number;
  rentBilled: number;
  rentCollected: number;
  cashCollected: number;
  outstandingRent: number;
  expenses: number;
  maintenanceOpen: number;
  urgentMaintenance: number;
  openIncidents: number;
  criticalIncidents: number;
  openSecurityEvents: number;
  offlineCameras: number;
  accessDenied24h: number;
  collectionRate: number;
}

export interface CommandCenter {
  asOf: string;
  period: {
    from: string;
    to: string;
  };
  portfolio: CommandCenterPortfolio;
  properties: CommandCenterProperty[];
  activeAlerts: CommandCenterAlert[];
}

export interface PropertyCard {
  id: string;
  name: string;
  code: string;
  healthScore: number;
  grade: HealthGrade;
  occupancy: number;
  collectionRate: number;
  outstandingRent: number;
  maintenanceOpen: number;
  securityOpen: number;
  cameraAvailability: number;
}
