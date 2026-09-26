import { Types } from 'mongoose';
import { Property } from '../../database/models/Property.js';
import { Unit } from '../../database/models/Unit.js';
import { Tenancy } from '../../database/models/Tenancy.js';
import { RentCharge } from '../../database/models/RentCharge.js';
import { Payment } from '../../database/models/Payment.js';
import { Expense } from '../../database/models/Expense.js';
import { ArrearsCase } from '../../database/models/ArrearsCase.js';
import { MaintenanceRequest } from '../../database/models/MaintenanceRequest.js';
import { Inspection } from '../../database/models/Inspection.js';
import { InventoryItem } from '../../database/models/InventoryItem.js';
import { SecurityCamera } from '../../database/models/SecurityCamera.js';
import { SecurityEvent } from '../../database/models/SecurityEvent.js';
import { Incident } from '../../database/models/Incident.js';
import { AccessEvent } from '../../database/models/AccessEvent.js';
import { PropertyHealthSnapshot } from '../../database/models/PropertyHealthSnapshot.js';
import { IntelligenceAlert } from '../../database/models/IntelligenceAlert.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { ResourceScopeService } from '../../core/authorization/resource-scope.service.js';
import { AppError } from '../../core/errors/AppError.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import type { AlertQuery, DashboardQuery } from './command-center.schemas.js';

const oid = (value: string) => new Types.ObjectId(value);
const ACTIVE_TENANCIES = ['ACTIVE', 'NOTICE'] as const;
const OPEN_MAINTENANCE = ['NEW', 'TRIAGED', 'ASSIGNED', 'QUOTED', 'APPROVAL_REQUIRED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED'] as const;
const OPEN_SECURITY = ['OPEN', 'ACKNOWLEDGED', 'ESCALATED'] as const;
const MS_DAY = 86_400_000;

interface AlertRule {
  code: string;
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  message: string;
  source: 'FINANCE' | 'OPERATIONS' | 'SECURITY' | 'OCCUPANCY' | 'COMPLIANCE' | 'INTELLIGENCE';
  metric: string;
  observedValue?: number;
  thresholdValue?: number;
}

interface PropertyMetrics {
  propertyId: Types.ObjectId;
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

const pct = (numerator: number, denominator: number) => denominator <= 0 ? 100 : Math.max(0, Math.min(100, (numerator / denominator) * 100));
const round = (value: number) => Math.round(value * 100) / 100;
const scoreDown = (value: number, good: number, bad: number) => {
  if (value <= good) return 100;
  if (value >= bad) return 0;
  return round(((bad - value) / (bad - good)) * 100);
};
const grade = (score: number): 'EXCELLENT' | 'GOOD' | 'WATCH' | 'AT_RISK' | 'CRITICAL' => score >= 90 ? 'EXCELLENT' : score >= 75 ? 'GOOD' : score >= 60 ? 'WATCH' : score >= 40 ? 'AT_RISK' : 'CRITICAL';

function period(query: DashboardQuery): { from: Date; to: Date } {
  const now = new Date();
  const from = query.from ?? new Date(now.getFullYear(), now.getMonth(), 1);
  const to = query.to ?? now;
  if (from > to) throw new AppError(400, 'INVALID_PERIOD', 'The period start must be before the period end');
  return { from, to };
}

export class CommandCenterService {
  private static async scopedProperties(auth: AuthenticatedUser, organizationId: Types.ObjectId, propertyId?: string) {
    AuthorizationService.assertPermission(auth, 'command-center.view', organizationId);
    const ids = await ResourceScopeService.scopedPropertyIds(auth, organizationId);
    const filter: Record<string, unknown> = { organizationId, status: 'ACTIVE' };
    if (ids) filter._id = { $in: ids };
    if (propertyId) {
      const requested = oid(propertyId);
      if (ids && !ids.some((id) => String(id) === String(requested))) throw new AppError(403, 'FORBIDDEN', 'You are not authorized to view this property');
      filter._id = requested;
    }
    return Property.find(filter).sort({ name: 1 }).lean();
  }

  private static async metricsForProperty(propertyId: Types.ObjectId, organizationId: Types.ObjectId, from: Date, to: Date): Promise<PropertyMetrics> {
    const [units, tenancies, charges, payments, expenses, arrears, maintenance, inspections, inventory, cameras, securityEvents, incidents, accessDenied] = await Promise.all([
      Unit.find({ organizationId, propertyId }).select('_id status').lean(),
      Tenancy.find({ organizationId, propertyId, status: { $in: ACTIVE_TENANCIES } }).select('_id unitId').lean(),
      RentCharge.find({ organizationId, propertyId, periodStart: { $gte: from, $lte: to }, status: { $ne: 'VOID' } }).select('totalAmount paidAmount balanceAmount').lean(),
      Payment.find({ organizationId, propertyId, status: 'CONFIRMED', paidAt: { $gte: from, $lte: to } }).select('amount').lean(),
      Expense.find({ organizationId, propertyId, status: { $in: ['APPROVED', 'PAID'] }, incurredAt: { $gte: from, $lte: to } }).select('amount category').lean(),
      ArrearsCase.find({ organizationId, propertyId, status: { $in: ['OPEN', 'CONTACTED', 'PROMISED', 'ESCALATED'] } }).select('amountOutstanding').lean(),
      MaintenanceRequest.find({ organizationId, propertyId, status: { $in: OPEN_MAINTENANCE } }).select('status priority actualAmount').lean(),
      Inspection.find({ organizationId, propertyId, status: 'COMPLETED', completedAt: { $gte: new Date(to.getTime() - 180 * MS_DAY), $lte: to } }).select('unitId').lean(),
      InventoryItem.find({ organizationId, propertyId, status: { $ne: 'DISPOSED' } }).select('nextServiceDueAt').lean(),
      SecurityCamera.find({ organizationId, propertyId, status: { $ne: 'DISABLED' } }).select('status').lean(),
      SecurityEvent.find({ organizationId, propertyId, status: { $in: OPEN_SECURITY } }).select('severity').lean(),
      Incident.find({ organizationId, propertyId, status: { $in: ['OPEN', 'INVESTIGATING', 'CONTAINED'] } }).select('severity').lean(),
      AccessEvent.countDocuments({ organizationId, propertyId, decision: 'DENIED', occurredAt: { $gte: new Date(to.getTime() - MS_DAY), $lte: to } })
    ]);

    const unitCount = units.length;
    const occupied = units.filter((u) => u.status === 'OCCUPIED').length;
    const vacant = units.filter((u) => u.status === 'VACANT').length;
    const reserved = units.filter((u) => u.status === 'RESERVED').length;
    const maintenanceUnits = units.filter((u) => u.status === 'MAINTENANCE').length;
    const billed = charges.reduce((sum, x) => sum + x.totalAmount, 0);
    const chargeCollected = charges.reduce((sum, x) => sum + x.paidAmount, 0);
    const paymentCollected = payments.reduce((sum, x) => sum + x.amount, 0);
    const collected = chargeCollected;
    const outstanding = charges.reduce((sum, x) => sum + x.balanceAmount, 0);
    const expenseTotal = expenses.reduce((sum, x) => sum + x.amount, 0);
    const maintenanceSpend = expenses.filter((x) => x.category === 'MAINTENANCE').reduce((sum, x) => sum + x.amount, 0);
    const openMaintenance = maintenance.length;
    const urgentMaintenance = maintenance.filter((x) => x.priority === 'EMERGENCY' || x.priority === 'HIGH').length;
    const inspectedUnits = new Set(inspections.map((x) => String(x.unitId))).size;
    const serviceDue = inventory.filter((x) => x.nextServiceDueAt && x.nextServiceDueAt <= to).length;
    const onlineCameras = cameras.filter((x) => x.status === 'ONLINE').length;
    const highCriticalEvents = securityEvents.filter((x) => x.severity === 'HIGH' || x.severity === 'CRITICAL').length;
    const criticalIncidents = incidents.filter((x) => x.severity === 'CRITICAL').length;

    return {
      propertyId, units: unitCount, occupiedUnits: occupied, vacantUnits: vacant, reservedUnits: reserved, maintenanceUnits,
      occupancyRate: unitCount === 0 ? 0 : round(pct(occupied, unitCount)), rentBilled: round(billed), rentCollected: round(collected), cashCollected: round(paymentCollected), collectionRate: round(pct(collected, billed)),
      outstandingRent: round(outstanding), arrearsCases: arrears.length, arrearsAmount: round(arrears.reduce((sum, x) => sum + x.amountOutstanding, 0)),
      expenses: round(expenseTotal), expenseRatio: round(expenseTotal / Math.max(collected, 1) * 100), maintenanceOpen: openMaintenance, urgentMaintenance,
      maintenanceSpend: round(maintenanceSpend), inspectionCoverage: unitCount === 0 ? 0 : round(pct(inspectedUnits, unitCount)), inventoryItems: inventory.length, inventoryServiceDue: serviceDue,
      cameras: cameras.length, camerasOnline: onlineCameras, openSecurityEvents: securityEvents.length, highCriticalSecurityEvents: highCriticalEvents,
      openIncidents: incidents.length, criticalIncidents, accessDenied24h: accessDenied
    };
  }

  private static score(metrics: PropertyMetrics) {
    const collection = metrics.collectionRate;
    const arrearsExposure = pct(metrics.arrearsAmount, Math.max(metrics.rentBilled, 1));
    const financial = round(collection * 0.5 + scoreDown(arrearsExposure, 5, 50) * 0.3 + scoreDown(metrics.expenseRatio, 20, 80) * 0.2);
    const maintenanceLoad = metrics.units === 0 ? 0 : (metrics.maintenanceOpen / metrics.units) * 100;
    const serviceDueRate = pct(metrics.inventoryServiceDue, Math.max(metrics.inventoryItems, 1));
    const operational = round(metrics.occupancyRate * 0.4 + scoreDown(maintenanceLoad, 5, 40) * 0.25 + metrics.inspectionCoverage * 0.2 + scoreDown(serviceDueRate, 5, 40) * 0.15);
    const incidentRisk = Math.min(100, metrics.criticalIncidents * 30 + metrics.openIncidents * 8);
    const eventRisk = Math.min(100, metrics.highCriticalSecurityEvents * 12 + metrics.openSecurityEvents * 3);
    const cameraCoverage = pct(metrics.camerasOnline, Math.max(metrics.cameras, 1));
    const security = round(scoreDown(incidentRisk, 0, 100) * 0.45 + scoreDown(eventRisk, 0, 100) * 0.30 + cameraCoverage * 0.25);
    const total = round(financial * 0.40 + operational * 0.35 + security * 0.25);
    const warningCodes: string[] = [];
    if (metrics.collectionRate < 85) warningCodes.push('LOW_COLLECTION');
    if (metrics.arrearsAmount > 0) warningCodes.push('ARREARS_EXPOSURE');
    if (metrics.occupancyRate < 90) warningCodes.push('VACANCY_RISK');
    if (metrics.urgentMaintenance > 0) warningCodes.push('URGENT_MAINTENANCE');
    if (metrics.maintenanceOpen > Math.max(3, metrics.units * 0.1)) warningCodes.push('MAINTENANCE_BACKLOG');
    if (metrics.inventoryServiceDue > 0) warningCodes.push('SERVICE_DUE');
    if (metrics.openIncidents > 0) warningCodes.push('OPEN_INCIDENT');
    if (metrics.highCriticalSecurityEvents > 0) warningCodes.push('SECURITY_SIGNAL');
    if (metrics.cameras > 0 && metrics.camerasOnline < metrics.cameras) warningCodes.push('CAMERA_COVERAGE');
    if (metrics.accessDenied24h >= 5) warningCodes.push('ACCESS_DENIAL_SPIKE');
    if (metrics.inspectionCoverage < 75) warningCodes.push('INSPECTION_GAP');
    return {
      score: total, grade: grade(total), warningCodes,
      dimensions: {
        financial: { score: financial, weight: 40, weightedScore: round(financial * 0.40), signals: ['collection rate', 'arrears exposure', 'expense ratio'] },
        operational: { score: operational, weight: 35, weightedScore: round(operational * 0.35), signals: ['occupancy', 'maintenance backlog', 'inspection coverage', 'service due'] },
        security: { score: security, weight: 25, weightedScore: round(security * 0.25), signals: ['incidents', 'security events', 'camera availability'] }
      }
    };
  }

  private static actions(metrics: PropertyMetrics, warningCodes: string[]) {
    const actions: Array<{ priority: 'CRITICAL' | 'HIGH' | 'MEDIUM'; code: string; title: string; reason: string }> = [];
    if (metrics.criticalIncidents > 0) actions.push({ priority: 'CRITICAL', code: 'REVIEW_CRITICAL_INCIDENT', title: 'Review critical security incidents', reason: `${metrics.criticalIncidents} critical incident(s) remain open.` });
    if (metrics.urgentMaintenance > 0) actions.push({ priority: 'HIGH', code: 'CLEAR_URGENT_MAINTENANCE', title: 'Clear urgent maintenance', reason: `${metrics.urgentMaintenance} emergency/high-priority job(s) require attention.` });
    if (metrics.collectionRate < 85) actions.push({ priority: 'HIGH', code: 'FOLLOW_UP_COLLECTION', title: 'Follow up rent collection', reason: `Collection is ${metrics.collectionRate}% for the selected period.` });
    if (metrics.vacantUnits > 0) actions.push({ priority: 'HIGH', code: 'ADDRESS_VACANCY', title: 'Address vacant units', reason: `${metrics.vacantUnits} unit(s) are currently vacant.` });
    if (metrics.inventoryServiceDue > 0) actions.push({ priority: 'MEDIUM', code: 'SCHEDULE_SERVICE', title: 'Schedule asset servicing', reason: `${metrics.inventoryServiceDue} asset(s) are due for service.` });
    if (metrics.inspectionCoverage < 75) actions.push({ priority: 'MEDIUM', code: 'COMPLETE_INSPECTIONS', title: 'Close inspection coverage gap', reason: `Only ${metrics.inspectionCoverage}% of units have a recent completed inspection.` });
    if (warningCodes.includes('CAMERA_COVERAGE')) actions.push({ priority: 'HIGH', code: 'RESTORE_CAMERA_COVERAGE', title: 'Restore CCTV coverage', reason: `${metrics.cameras - metrics.camerasOnline} camera(s) are not online.` });
    return actions;
  }

  static async dashboard(auth: AuthenticatedUser, organizationId: string, query: DashboardQuery) {
    const orgId = oid(organizationId); const { from, to } = period(query);
    const properties = await this.scopedProperties(auth, orgId, query.propertyId);
    const cards = await Promise.all(properties.map(async (property) => {
      const metrics = await this.metricsForProperty(property._id, orgId, from, to); const scoring = this.score(metrics);
      return { property: { _id: property._id, name: property.name, code: property.code, propertyType: property.propertyType, address: property.address }, health: scoring, metrics, actions: this.actions(metrics, scoring.warningCodes) };
    }));
    const aggregate = cards.reduce((acc, card) => ({
      units: acc.units + card.metrics.units, occupiedUnits: acc.occupiedUnits + card.metrics.occupiedUnits, vacantUnits: acc.vacantUnits + card.metrics.vacantUnits,
      rentBilled: acc.rentBilled + card.metrics.rentBilled, rentCollected: acc.rentCollected + card.metrics.rentCollected, cashCollected: acc.cashCollected + card.metrics.cashCollected, outstandingRent: acc.outstandingRent + card.metrics.outstandingRent,
      expenses: acc.expenses + card.metrics.expenses, maintenanceOpen: acc.maintenanceOpen + card.metrics.maintenanceOpen, urgentMaintenance: acc.urgentMaintenance + card.metrics.urgentMaintenance,
      openIncidents: acc.openIncidents + card.metrics.openIncidents, criticalIncidents: acc.criticalIncidents + card.metrics.criticalIncidents, openSecurityEvents: acc.openSecurityEvents + card.metrics.openSecurityEvents,
      offlineCameras: acc.offlineCameras + Math.max(0, card.metrics.cameras - card.metrics.camerasOnline), accessDenied24h: acc.accessDenied24h + card.metrics.accessDenied24h
    }), { units: 0, occupiedUnits: 0, vacantUnits: 0, rentBilled: 0, rentCollected: 0, cashCollected: 0, outstandingRent: 0, expenses: 0, maintenanceOpen: 0, urgentMaintenance: 0, openIncidents: 0, criticalIncidents: 0, openSecurityEvents: 0, offlineCameras: 0, accessDenied24h: 0 });
    const portfolioCollection = round(pct(aggregate.rentCollected, aggregate.rentBilled));
    const healthScores = cards.map((c) => c.health.score);
    const portfolioHealth = healthScores.length ? round(healthScores.reduce((a, b) => a + b, 0) / healthScores.length) : 100;
    const alerts = await IntelligenceAlert.find({ organizationId: orgId, status: { $in: ['OPEN', 'ACKNOWLEDGED'] }, ...(query.propertyId ? { propertyId: oid(query.propertyId) } : {}) }).sort({ severity: -1, lastDetectedAt: -1 }).limit(20).lean();
    return { asOf: new Date(), period: { from, to }, portfolio: { propertyCount: cards.length, healthScore: portfolioHealth, grade: grade(portfolioHealth), collectionRate: portfolioCollection, ...aggregate }, properties: cards, activeAlerts: alerts };
  }

  static async propertyHealth(auth: AuthenticatedUser, organizationId: string, propertyId: string, query: DashboardQuery) {
    const result = await this.dashboard(auth, organizationId, { ...query, propertyId });
    if (!result.properties[0]) throw new AppError(404, 'PROPERTY_NOT_FOUND', 'Property not found');
    return result.properties[0];
  }

  static async listAlerts(auth: AuthenticatedUser, organizationId: string, query: AlertQuery) {
    const orgId = oid(organizationId); AuthorizationService.assertPermission(auth, 'intelligence.alert.view', orgId);
    const properties = await this.scopedProperties(auth, orgId, query.propertyId);
    const propertyIds = properties.map((p) => p._id);
    return IntelligenceAlert.find({ organizationId: orgId, propertyId: { $in: propertyIds }, ...(query.status ? { status: query.status } : {}), ...(query.severity ? { severity: query.severity } : {}) }).sort({ severity: -1, lastDetectedAt: -1 }).limit(query.limit).lean();
  }

  static async updateAlert(auth: AuthenticatedUser, id: string, status: 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED') {
    const alert = await IntelligenceAlert.findById(id); if (!alert) throw new AppError(404, 'ALERT_NOT_FOUND', 'Intelligence alert not found');
    AuthorizationService.assertCan(auth, 'intelligence.alert.manage', { organizationId: alert.organizationId, propertyId: alert.propertyId });
    const now = new Date(); alert.status = status; if (status === 'ACKNOWLEDGED') { alert.acknowledgedAt = now; alert.acknowledgedBy = auth.userId; } else { alert.resolvedAt = now; alert.resolvedBy = auth.userId; } await alert.save(); return alert;
  }

  static async evaluateOrganization(organizationId: Types.ObjectId, from: Date, to: Date, actorUserId?: Types.ObjectId, propertyIds?: Types.ObjectId[]) {
    const properties = await Property.find({ organizationId, status: 'ACTIVE', ...(propertyIds ? { _id: { $in: propertyIds } } : {}) }).sort({ name: 1 }).lean();
    const created: unknown[] = [];
    for (const property of properties) {
      const metrics = await this.metricsForProperty(property._id, organizationId, from, to); const scoring = this.score(metrics); const now = new Date();
      await PropertyHealthSnapshot.create({ organizationId, propertyId: property._id, asOf: now, periodStart: from, periodEnd: to, score: scoring.score, grade: scoring.grade, dimensions: scoring.dimensions, metrics, warningCodes: scoring.warningCodes, ...(actorUserId ? { createdBy: actorUserId } : {}) });
      const rules = this.alertRules(metrics);
      for (const rule of rules) {
        const existing = await IntelligenceAlert.findOne({ organizationId, propertyId: property._id, code: rule.code, status: { $in: ['OPEN', 'ACKNOWLEDGED'] } });
        if (existing) { existing.lastDetectedAt = now; existing.observedValue = rule.observedValue; existing.thresholdValue = rule.thresholdValue; await existing.save(); created.push(existing); continue; }
        const alert = await IntelligenceAlert.create({ organizationId, propertyId: property._id, ...rule, firstDetectedAt: now, lastDetectedAt: now }); created.push(alert);
        if (actorUserId) {
          await AuditService.record({ organizationId, actorUserId, action: 'intelligence.alert.created', resourceType: 'IntelligenceAlert', resourceId: alert._id, propertyId: property._id, after: alert.toObject() });
          await AuditService.publish({ organizationId, actorUserId, name: 'intelligence.alert.created', aggregateType: 'IntelligenceAlert', aggregateId: alert._id, payload: { code: alert.code, severity: alert.severity, propertyId: property._id } });
        }
      }
    }
    return { evaluatedProperties: properties.length, alerts: created };
  }

  static async evaluate(auth: AuthenticatedUser, organizationId: string, query: DashboardQuery) {
    const orgId = oid(organizationId); AuthorizationService.assertPermission(auth, 'intelligence.evaluate', orgId); const { from, to } = period(query);
    if (query.propertyId) {
      const property = await Property.findOne({ _id: oid(query.propertyId), organizationId: orgId, status: 'ACTIVE' }).lean();
      if (!property) throw new AppError(404, 'PROPERTY_NOT_FOUND', 'Property not found');
      await ResourceScopeService.assertProperty(auth, property);
      const metrics = await this.metricsForProperty(property._id, orgId, from, to); const scoring = this.score(metrics); const now = new Date();
      await PropertyHealthSnapshot.create({ organizationId: orgId, propertyId: property._id, asOf: now, periodStart: from, periodEnd: to, score: scoring.score, grade: scoring.grade, dimensions: scoring.dimensions, metrics, warningCodes: scoring.warningCodes, createdBy: auth.userId });
      const rules = this.alertRules(metrics); const alerts: unknown[] = [];
      for (const rule of rules) {
        const existing = await IntelligenceAlert.findOne({ organizationId: orgId, propertyId: property._id, code: rule.code, status: { $in: ['OPEN', 'ACKNOWLEDGED'] } });
        if (existing) { existing.lastDetectedAt = now; existing.observedValue = rule.observedValue; existing.thresholdValue = rule.thresholdValue; await existing.save(); alerts.push(existing); continue; }
        const alert = await IntelligenceAlert.create({ organizationId: orgId, propertyId: property._id, ...rule, firstDetectedAt: now, lastDetectedAt: now }); alerts.push(alert);
        await AuditService.record({ organizationId: orgId, actorUserId: auth.userId, action: 'intelligence.alert.created', resourceType: 'IntelligenceAlert', resourceId: alert._id, propertyId: property._id, after: alert.toObject() });
        await AuditService.publish({ organizationId: orgId, actorUserId: auth.userId, name: 'intelligence.alert.created', aggregateType: 'IntelligenceAlert', aggregateId: alert._id, payload: { code: alert.code, severity: alert.severity, propertyId: property._id } });
      }
      return { evaluatedProperties: 1, alerts };
    }
    const properties = await this.scopedProperties(auth, orgId); const result = await this.evaluateOrganization(orgId, from, to, auth.userId, properties.map((property) => property._id));
    return result;
  }

  private static alertRules(metrics: PropertyMetrics): AlertRule[] {
    const rules: AlertRule[] = [];
    if (metrics.collectionRate < 85) rules.push({ code: 'LOW_COLLECTION', severity: metrics.collectionRate < 70 ? 'HIGH' : 'MEDIUM', title: 'Rent collection below target', message: `Collection rate is ${metrics.collectionRate}%.`, source: 'FINANCE', metric: 'collectionRate', observedValue: metrics.collectionRate, thresholdValue: 85 });
    if (metrics.arrearsAmount > 0) rules.push({ code: 'ARREARS_EXPOSURE', severity: metrics.arrearsAmount > Math.max(metrics.rentBilled * 0.25, 1) ? 'HIGH' : 'MEDIUM', title: 'Arrears exposure detected', message: `${metrics.arrearsAmount} remains outstanding across active arrears cases.`, source: 'FINANCE', metric: 'arrearsAmount', observedValue: metrics.arrearsAmount, thresholdValue: 0 });
    if (metrics.urgentMaintenance > 0) rules.push({ code: 'URGENT_MAINTENANCE', severity: 'HIGH', title: 'Urgent maintenance requires attention', message: `${metrics.urgentMaintenance} urgent maintenance job(s) are open.`, source: 'OPERATIONS', metric: 'urgentMaintenance', observedValue: metrics.urgentMaintenance, thresholdValue: 0 });
    if (metrics.openIncidents > 0) rules.push({ code: 'OPEN_INCIDENT', severity: metrics.criticalIncidents > 0 ? 'CRITICAL' : 'HIGH', title: 'Open security incident', message: `${metrics.openIncidents} security incident(s) remain open.`, source: 'SECURITY', metric: 'openIncidents', observedValue: metrics.openIncidents, thresholdValue: 0 });
    if (metrics.cameras > 0 && metrics.camerasOnline < metrics.cameras) rules.push({ code: 'CAMERA_COVERAGE', severity: 'HIGH', title: 'CCTV coverage degraded', message: `${metrics.cameras - metrics.camerasOnline} camera(s) are not online.`, source: 'SECURITY', metric: 'offlineCameras', observedValue: metrics.cameras - metrics.camerasOnline, thresholdValue: 0 });
    if (metrics.accessDenied24h >= 5) rules.push({ code: 'ACCESS_DENIAL_SPIKE', severity: 'HIGH', title: 'Access denial spike', message: `${metrics.accessDenied24h} denied access events were recorded in the last 24 hours.`, source: 'SECURITY', metric: 'accessDenied24h', observedValue: metrics.accessDenied24h, thresholdValue: 5 });
    if (metrics.occupancyRate < 90) rules.push({ code: 'VACANCY_RISK', severity: metrics.occupancyRate < 75 ? 'HIGH' : 'MEDIUM', title: 'Vacancy risk', message: `Occupancy is ${metrics.occupancyRate}%.`, source: 'OCCUPANCY', metric: 'occupancyRate', observedValue: metrics.occupancyRate, thresholdValue: 90 });
    if (metrics.inspectionCoverage < 75) rules.push({ code: 'INSPECTION_GAP', severity: 'MEDIUM', title: 'Inspection coverage gap', message: `Only ${metrics.inspectionCoverage}% of units have a recent completed inspection.`, source: 'COMPLIANCE', metric: 'inspectionCoverage', observedValue: metrics.inspectionCoverage, thresholdValue: 75 });
    return rules;
  }

  static async healthHistory(auth: AuthenticatedUser, organizationId: string, propertyId: string, limit = 30) {
    const orgId = oid(organizationId); AuthorizationService.assertPermission(auth, 'intelligence.history.view', orgId); const property = await Property.findOne({ _id: oid(propertyId), organizationId: orgId, status: 'ACTIVE' }).lean();
    if (!property) throw new AppError(404, 'PROPERTY_NOT_FOUND', 'Property not found'); await ResourceScopeService.assertProperty(auth, property); return PropertyHealthSnapshot.find({ organizationId: orgId, propertyId: property._id }).sort({ asOf: -1 }).limit(limit).lean();
  }
}
