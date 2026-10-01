import { Types } from "mongoose";
import { SecurityCamera } from "../../database/models/SecurityCamera.js";
import { SecurityEvent } from "../../database/models/SecurityEvent.js";
import { Incident } from "../../database/models/Incident.js";
import { AccessPoint } from "../../database/models/AccessPoint.js";
import { AccessEvent } from "../../database/models/AccessEvent.js";
import { Tenant } from "../../database/models/Tenant.js";
import { User } from "../../database/models/User.js";
import { ResourceScopeService } from "../../core/authorization/resource-scope.service.js";
import { AuthorizationService } from "../../core/authorization/authorization.service.js";
import { AppError } from "../../core/errors/AppError.js";
import { AuditService } from "../audit/audit.service.js";
import { BillingService } from "../billing/billing.service.js";
import type { AuthenticatedUser } from "../../core/types/auth.js";
import type { z } from "zod";
import type * as S from "./security.schemas.js";

type CreateCamera = z.infer<typeof S.createCameraSchema>;
type UpdateCamera = z.infer<typeof S.updateCameraSchema>;
type CreateEvent = z.infer<typeof S.createSecurityEventSchema>;
type EventQuery = z.infer<typeof S.securityEventQuerySchema>;
type CreateIncident = z.infer<typeof S.createIncidentSchema>;
type IncidentQuery = z.infer<typeof S.incidentQuerySchema>;
type CreatePoint = z.infer<typeof S.createAccessPointSchema>;
type UpdatePoint = z.infer<typeof S.updateAccessPointSchema>;
type CreateAccess = z.infer<typeof S.createAccessEventSchema>;
type AccessQuery = z.infer<typeof S.accessEventQuerySchema>;
const oid = (v: string) => new Types.ObjectId(v);
const isTenant = (auth: AuthenticatedUser, org: Types.ObjectId) =>
  auth.memberships.some(
    (m) =>
      String(m.organizationId) === String(org) && m.roles.includes("TENANT"),
  ) && !auth.isPlatformAdmin;
export function hierarchicalScopeClauses(
  propertyIds: Types.ObjectId[],
  buildingIds: Types.ObjectId[],
  unitIds: Types.ObjectId[],
) {
  return [
    { unitId: { $in: unitIds } },
    { unitId: { $exists: false }, buildingId: { $in: buildingIds } },
    {
      unitId: { $exists: false },
      buildingId: { $exists: false },
      propertyId: { $in: propertyIds },
    },
  ];
}
async function securityScope(
  auth: AuthenticatedUser,
  org: Types.ObjectId,
): Promise<Record<string, unknown>> {
  const unitIds = await ResourceScopeService.scopedUnitIds(auth, org);
  if (unitIds === null) return {};
  const [buildingIds, propertyIds] = await Promise.all([
    ResourceScopeService.scopedBuildingIds(auth, org),
    ResourceScopeService.scopedPropertyIds(auth, org),
  ]);
  return {
    $or: hierarchicalScopeClauses(
      propertyIds ?? [],
      buildingIds ?? [],
      unitIds,
    ),
  };
}
async function hierarchy(
  auth: AuthenticatedUser,
  org: Types.ObjectId,
  d: {
    propertyId: string;
    buildingId?: string;
    floorId?: string;
    unitId?: string;
  },
  permission: string,
) {
  const property =
    await ResourceScopeService.assertPropertyExistsInOrganization(
      d.propertyId,
      org,
    );
  await ResourceScopeService.assertProperty(auth, property, permission);
  if (d.buildingId) {
    const b = await ResourceScopeService.assertBuildingExistsInOrganization(
      d.buildingId,
      org,
    );
    if (String(b.propertyId) !== d.propertyId)
      throw new AppError(
        400,
        "HIERARCHY_MISMATCH",
        "Building does not belong to property",
      );
    await ResourceScopeService.assertBuilding(auth, b, permission);
  }
  if (d.floorId) {
    const f = await ResourceScopeService.assertFloorExistsInOrganization(
      d.floorId,
      org,
    );
    if (d.buildingId && String(f.buildingId) !== d.buildingId)
      throw new AppError(
        400,
        "HIERARCHY_MISMATCH",
        "Floor does not belong to building",
      );
  }
  if (d.unitId) {
    const u = await ResourceScopeService.assertUnitExistsInOrganization(
      d.unitId,
      org,
    );
    if (String(u.propertyId) !== d.propertyId)
      throw new AppError(
        400,
        "HIERARCHY_MISMATCH",
        "Unit does not belong to property",
      );
    if (d.buildingId && String(u.buildingId) !== d.buildingId)
      throw new AppError(
        400,
        "HIERARCHY_MISMATCH",
        "Unit does not belong to building",
      );
    if (d.floorId && String(u.floorId) !== d.floorId)
      throw new AppError(
        400,
        "HIERARCHY_MISMATCH",
        "Unit does not belong to floor",
      );
    ResourceScopeService.assertUnit(auth, u, permission);
  }
  return property;
}
async function authorizeStored(
  auth: AuthenticatedUser,
  x: {
    organizationId: Types.ObjectId;
    propertyId: Types.ObjectId;
    buildingId?: Types.ObjectId | null;
    unitId?: Types.ObjectId | null;
  },
  permission: string,
) {
  if (x.unitId) {
    ResourceScopeService.assertUnit(
      auth,
      {
        _id: x.unitId,
        organizationId: x.organizationId,
        propertyId: x.propertyId,
        buildingId: x.buildingId!,
      },
      permission,
    );
    return;
  }
  if (x.buildingId) {
    await ResourceScopeService.assertBuilding(
      auth,
      {
        _id: x.buildingId,
        organizationId: x.organizationId,
        propertyId: x.propertyId,
      },
      permission,
    );
    return;
  }
  await ResourceScopeService.assertProperty(
    auth,
    { _id: x.propertyId, organizationId: x.organizationId },
    permission,
  );
}
function nextIncidentNumber() {
  return `INC-${new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14)}-${Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0")}`;
}

export class SecurityService {
  static async createCamera(
    auth: AuthenticatedUser,
    organizationId: string,
    data: CreateCamera,
  ) {
    const org = oid(organizationId);
    AuthorizationService.assertPermission(auth, "cctv.manage", org);
    await hierarchy(auth, org, data, "cctv.manage");
    const c = await SecurityCamera.create({
      organizationId: org,
      ...data,
      propertyId: oid(data.propertyId),
      buildingId: data.buildingId ? oid(data.buildingId) : undefined,
      floorId: data.floorId ? oid(data.floorId) : undefined,
      unitId: data.unitId ? oid(data.unitId) : undefined,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    });
    await AuditService.record({
      organizationId: org,
      actorUserId: auth.userId,
      action: "security.camera.created",
      resourceType: "SecurityCamera",
      resourceId: c._id,
      propertyId: c.propertyId,
      buildingId: c.buildingId,
      unitId: c.unitId,
      after: c.toObject(),
    });
    return c;
  }
  static async listCameras(auth: AuthenticatedUser, organizationId: string) {
    const org = oid(organizationId);
    AuthorizationService.assertPermission(auth, "cctv.view", org);
    const filter: Record<string, unknown> = {
      organizationId: org,
      ...(await securityScope(auth, org)),
    };
    return SecurityCamera.find(filter).sort({ propertyId: 1, name: 1 }).lean();
  }
  static async updateCamera(
    auth: AuthenticatedUser,
    id: string,
    data: UpdateCamera,
  ) {
    if (!Types.ObjectId.isValid(id))
      throw new AppError(400, "INVALID_ID", "Invalid camera id");
    const c = await SecurityCamera.findById(id);
    if (!c) throw new AppError(404, "CAMERA_NOT_FOUND", "Camera not found");
    await BillingService.assertFeature(String(c.organizationId), "security");
    await authorizeStored(auth, c, "cctv.manage");
    const before = c.toObject();
    Object.assign(c, {
      ...data,
      propertyId: data.propertyId ? oid(data.propertyId) : c.propertyId,
      buildingId: data.buildingId ? oid(data.buildingId) : c.buildingId,
      floorId: data.floorId ? oid(data.floorId) : c.floorId,
      unitId: data.unitId ? oid(data.unitId) : c.unitId,
      updatedBy: auth.userId,
    });
    await c.save();
    await AuditService.record({
      organizationId: c.organizationId,
      actorUserId: auth.userId,
      action: "security.camera.updated",
      resourceType: "SecurityCamera",
      resourceId: c._id,
      propertyId: c.propertyId,
      buildingId: c.buildingId,
      unitId: c.unitId,
      before,
      after: c.toObject(),
    });
    return c;
  }
  static async getLiveStream(auth: AuthenticatedUser, id: string) {
    const c = await SecurityCamera.findById(id).lean();
    if (!c) throw new AppError(404, "CAMERA_NOT_FOUND", "Camera not found");
    await BillingService.assertFeature(String(c.organizationId), "security");
    await authorizeStored(auth, c, "cctv.view");
    if (!c.streamRef)
      throw new AppError(
        409,
        "STREAM_UNAVAILABLE",
        "Camera live stream provider is not configured",
      );
    return { cameraId: c._id, provider: c.provider, streamRef: c.streamRef };
  }
  static async getPlayback(auth: AuthenticatedUser, id: string) {
    const c = await SecurityCamera.findById(id).lean();
    if (!c) throw new AppError(404, "CAMERA_NOT_FOUND", "Camera not found");
    await BillingService.assertFeature(String(c.organizationId), "security");
    await authorizeStored(auth, c, "cctv.playback");
    if (!c.playbackRef)
      throw new AppError(
        409,
        "PLAYBACK_UNAVAILABLE",
        "Camera playback provider is not configured",
      );
    return {
      cameraId: c._id,
      provider: c.provider,
      playbackRef: c.playbackRef,
    };
  }
  static async createEvent(
    auth: AuthenticatedUser,
    organizationId: string,
    data: CreateEvent,
  ) {
    const org = oid(organizationId);
    AuthorizationService.assertPermission(auth, "security-event.manage", org);
    await hierarchy(auth, org, data, "security-event.manage");
    if (data.cameraId) {
      const camera = await SecurityCamera.findOne({
        _id: oid(data.cameraId),
        organizationId: org,
      });
      if (!camera)
        throw new AppError(404, "CAMERA_NOT_FOUND", "Camera not found");
      if (String(camera.propertyId) !== data.propertyId)
        throw new AppError(
          400,
          "HIERARCHY_MISMATCH",
          "Camera does not belong to property",
        );
    }
    const e = await SecurityEvent.create({
      organizationId: org,
      ...data,
      propertyId: oid(data.propertyId),
      buildingId: data.buildingId ? oid(data.buildingId) : undefined,
      floorId: data.floorId ? oid(data.floorId) : undefined,
      unitId: data.unitId ? oid(data.unitId) : undefined,
      cameraId: data.cameraId ? oid(data.cameraId) : undefined,
      snapshotEvidenceIds: data.snapshotEvidenceIds.map(oid),
      createdBy: auth.userId,
      updatedBy: auth.userId,
    });
    await AuditService.record({
      organizationId: org,
      actorUserId: auth.userId,
      action: "security.event.created",
      resourceType: "SecurityEvent",
      resourceId: e._id,
      propertyId: e.propertyId,
      buildingId: e.buildingId,
      unitId: e.unitId,
      after: e.toObject(),
    });
    await AuditService.publish({
      organizationId: org,
      name: "security.event.created",
      aggregateType: "SecurityEvent",
      aggregateId: e._id,
      actorUserId: auth.userId,
      payload: {
        type: e.type,
        severity: e.severity,
        propertyId: e.propertyId,
        cameraId: e.cameraId,
      },
    });
    return e;
  }
  static async listEvents(auth: AuthenticatedUser, q: EventQuery) {
    const org = oid(q.organizationId);
    AuthorizationService.assertPermission(auth, "security-event.view", org);
    const f: Record<string, unknown> = {
      organizationId: org,
      ...(await securityScope(auth, org)),
    };
    if (q.propertyId) f.propertyId = oid(q.propertyId);
    if (q.cameraId) f.cameraId = oid(q.cameraId);
    if (q.status) f.status = q.status;
    if (q.severity) f.severity = q.severity;
    if (q.from || q.to)
      f.detectedAt = {
        ...(q.from ? { $gte: q.from } : {}),
        ...(q.to ? { $lte: q.to } : {}),
      };
    return SecurityEvent.find(f).sort({ detectedAt: -1 }).limit(q.limit).lean();
  }
  static async updateEvent(
    auth: AuthenticatedUser,
    id: string,
    data: z.infer<typeof S.securityEventStatusSchema>,
  ) {
    const e = await SecurityEvent.findById(id);
    if (!e)
      throw new AppError(
        404,
        "SECURITY_EVENT_NOT_FOUND",
        "Security event not found",
      );
    await BillingService.assertFeature(String(e.organizationId), "security");
    await authorizeStored(auth, e, "security-event.manage");
    if (
      !["OPEN", "ACKNOWLEDGED", "ESCALATED", "RESOLVED", "DISMISSED"].includes(
        e.status,
      )
    )
      throw new AppError(
        409,
        "INVALID_STATE",
        "Security event cannot be changed",
      );
    const before = e.toObject();
    e.status = data.status;
    if (data.status === "ACKNOWLEDGED") {
      e.acknowledgedAt = new Date();
      e.acknowledgedBy = auth.userId;
    }
    if (["RESOLVED", "DISMISSED"].includes(data.status)) {
      e.resolvedAt = new Date();
      e.resolvedBy = auth.userId;
    }
    if (data.notes) e.description = data.notes;
    e.updatedBy = auth.userId;
    await e.save();
    await AuditService.record({
      organizationId: e.organizationId,
      actorUserId: auth.userId,
      action: "security.event.updated",
      resourceType: "SecurityEvent",
      resourceId: e._id,
      propertyId: e.propertyId,
      buildingId: e.buildingId,
      unitId: e.unitId,
      before,
      after: e.toObject(),
    });
    return e;
  }
  static async createIncident(
    auth: AuthenticatedUser,
    organizationId: string,
    data: CreateIncident,
  ) {
    const org = oid(organizationId);
    AuthorizationService.assertPermission(auth, "incident.manage", org);
    await hierarchy(auth, org, data, "incident.manage");
    if (data.sourceEventIds.length) {
      const count = await SecurityEvent.countDocuments({
        _id: { $in: data.sourceEventIds.map(oid) },
        organizationId: org,
        propertyId: oid(data.propertyId),
      });
      if (count !== data.sourceEventIds.length)
        throw new AppError(
          400,
          "INVALID_SOURCE_EVENTS",
          "One or more source security events do not belong to this property",
        );
    }
    const inc = await Incident.create({
      organizationId: org,
      ...data,
      incidentNumber: nextIncidentNumber(),
      propertyId: oid(data.propertyId),
      buildingId: data.buildingId ? oid(data.buildingId) : undefined,
      floorId: data.floorId ? oid(data.floorId) : undefined,
      unitId: data.unitId ? oid(data.unitId) : undefined,
      sourceEventIds: data.sourceEventIds.map(oid),
      evidenceIds: data.evidenceIds.map(oid),
      documentIds: data.documentIds.map(oid),
      assignedToUserId: data.assignedToUserId
        ? oid(data.assignedToUserId)
        : undefined,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    });
    await AuditService.record({
      organizationId: org,
      actorUserId: auth.userId,
      action: "incident.created",
      resourceType: "Incident",
      resourceId: inc._id,
      propertyId: inc.propertyId,
      buildingId: inc.buildingId,
      unitId: inc.unitId,
      after: inc.toObject(),
    });
    await AuditService.publish({
      organizationId: org,
      name: "incident.created",
      aggregateType: "Incident",
      aggregateId: inc._id,
      actorUserId: auth.userId,
      payload: { severity: inc.severity, category: inc.category },
    });
    return inc;
  }
  static async listIncidents(auth: AuthenticatedUser, q: IncidentQuery) {
    const org = oid(q.organizationId);
    AuthorizationService.assertPermission(auth, "incident.view", org);
    const f: Record<string, unknown> = {
      organizationId: org,
      ...(await securityScope(auth, org)),
    };
    if (q.propertyId) f.propertyId = oid(q.propertyId);
    if (q.status) f.status = q.status;
    if (q.severity) f.severity = q.severity;
    if (q.from || q.to)
      f.reportedAt = {
        ...(q.from ? { $gte: q.from } : {}),
        ...(q.to ? { $lte: q.to } : {}),
      };
    return Incident.find(f).sort({ reportedAt: -1 }).limit(q.limit).lean();
  }
  static async updateIncident(
    auth: AuthenticatedUser,
    id: string,
    data: z.infer<typeof S.incidentStatusSchema>,
  ) {
    const inc = await Incident.findById(id);
    if (!inc)
      throw new AppError(404, "INCIDENT_NOT_FOUND", "Incident not found");
    await BillingService.assertFeature(String(inc.organizationId), "security");
    await authorizeStored(auth, inc, "incident.manage");
    const transitions: Record<string, string[]> = {
      OPEN: ["INVESTIGATING", "FALSE_ALARM"],
      INVESTIGATING: ["CONTAINED", "RESOLVED", "FALSE_ALARM"],
      CONTAINED: ["RESOLVED"],
      RESOLVED: ["CLOSED"],
      CLOSED: [],
      FALSE_ALARM: ["CLOSED"],
    };
    if (!transitions[inc.status]?.includes(data.status))
      throw new AppError(
        409,
        "INVALID_TRANSITION",
        `Incident cannot move from ${inc.status} to ${data.status}`,
      );
    const before = inc.toObject();
    inc.status = data.status;
    if (data.status === "CONTAINED") inc.containedAt = new Date();
    if (data.status === "RESOLVED") inc.resolvedAt = new Date();
    if (data.status === "CLOSED") inc.closedAt = new Date();
    if (data.notes) inc.resolutionNotes = data.notes;
    inc.updatedBy = auth.userId;
    await inc.save();
    await AuditService.record({
      organizationId: inc.organizationId,
      actorUserId: auth.userId,
      action: "incident.updated",
      resourceType: "Incident",
      resourceId: inc._id,
      propertyId: inc.propertyId,
      buildingId: inc.buildingId,
      unitId: inc.unitId,
      before,
      after: inc.toObject(),
    });
    return inc;
  }
  static async createAccessPoint(
    auth: AuthenticatedUser,
    organizationId: string,
    data: CreatePoint,
  ) {
    const org = oid(organizationId);
    AuthorizationService.assertPermission(auth, "access-point.manage", org);
    await hierarchy(auth, org, data, "access-point.manage");
    const p = await AccessPoint.create({
      organizationId: org,
      ...data,
      propertyId: oid(data.propertyId),
      buildingId: data.buildingId ? oid(data.buildingId) : undefined,
      floorId: data.floorId ? oid(data.floorId) : undefined,
      unitId: data.unitId ? oid(data.unitId) : undefined,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    });
    await AuditService.record({
      organizationId: org,
      actorUserId: auth.userId,
      action: "access-point.created",
      resourceType: "AccessPoint",
      resourceId: p._id,
      propertyId: p.propertyId,
      buildingId: p.buildingId,
      unitId: p.unitId,
      after: p.toObject(),
    });
    return p;
  }
  static async listAccessPoints(
    auth: AuthenticatedUser,
    organizationId: string,
  ) {
    const org = oid(organizationId);
    AuthorizationService.assertPermission(auth, "access-point.view", org);
    const f: Record<string, unknown> = {
      organizationId: org,
      ...(await securityScope(auth, org)),
    };
    return AccessPoint.find(f).sort({ propertyId: 1, name: 1 }).lean();
  }
  static async updateAccessPoint(
    auth: AuthenticatedUser,
    id: string,
    data: UpdatePoint,
  ) {
    const p = await AccessPoint.findById(id);
    if (!p)
      throw new AppError(
        404,
        "ACCESS_POINT_NOT_FOUND",
        "Access point not found",
      );
    await BillingService.assertFeature(String(p.organizationId), "security");
    await authorizeStored(auth, p, "access-point.manage");
    const before = p.toObject();
    Object.assign(p, {
      ...data,
      propertyId: data.propertyId ? oid(data.propertyId) : p.propertyId,
      buildingId: data.buildingId ? oid(data.buildingId) : p.buildingId,
      floorId: data.floorId ? oid(data.floorId) : p.floorId,
      unitId: data.unitId ? oid(data.unitId) : p.unitId,
      updatedBy: auth.userId,
    });
    await p.save();
    await AuditService.record({
      organizationId: p.organizationId,
      actorUserId: auth.userId,
      action: "access-point.updated",
      resourceType: "AccessPoint",
      resourceId: p._id,
      propertyId: p.propertyId,
      buildingId: p.buildingId,
      unitId: p.unitId,
      before,
      after: p.toObject(),
    });
    return p;
  }
  static async createAccessEvent(
    auth: AuthenticatedUser,
    organizationId: string,
    data: CreateAccess,
  ) {
    const org = oid(organizationId);
    AuthorizationService.assertPermission(auth, "access-event.ingest", org);
    await hierarchy(auth, org, data, "access-event.ingest");
    const p = await AccessPoint.findOne({
      _id: oid(data.accessPointId),
      organizationId: org,
    });
    if (!p)
      throw new AppError(
        404,
        "ACCESS_POINT_NOT_FOUND",
        "Access point not found",
      );
    if (String(p.propertyId) !== data.propertyId)
      throw new AppError(
        400,
        "HIERARCHY_MISMATCH",
        "Access point does not belong to property",
      );
    if (
      data.userId &&
      !(await User.exists({ _id: oid(data.userId), status: "ACTIVE" }))
    )
      throw new AppError(404, "USER_NOT_FOUND", "User not found");
    if (
      data.tenantId &&
      !(await Tenant.exists({ _id: oid(data.tenantId), organizationId: org }))
    )
      throw new AppError(404, "TENANT_NOT_FOUND", "Tenant not found");
    const e = await AccessEvent.create({
      organizationId: org,
      ...data,
      propertyId: oid(data.propertyId),
      buildingId: data.buildingId ? oid(data.buildingId) : undefined,
      floorId: data.floorId ? oid(data.floorId) : undefined,
      unitId: data.unitId ? oid(data.unitId) : undefined,
      accessPointId: oid(data.accessPointId),
      userId: data.userId ? oid(data.userId) : undefined,
      tenantId: data.tenantId ? oid(data.tenantId) : undefined,
      evidenceIds: data.evidenceIds.map(oid),
    });
    await AuditService.record({
      organizationId: org,
      action: "access-event.ingested",
      resourceType: "AccessEvent",
      resourceId: e._id,
      propertyId: e.propertyId,
      buildingId: e.buildingId,
      unitId: e.unitId,
      metadata: { decision: e.decision, eventType: e.eventType },
    });
    if (e.decision === "DENIED" || e.eventType === "FORCED_OPEN")
      await AuditService.publish({
        organizationId: org,
        name: "access.event.security_signal",
        aggregateType: "AccessEvent",
        aggregateId: e._id,
        payload: {
          decision: e.decision,
          eventType: e.eventType,
          propertyId: e.propertyId,
        },
      });
    return e;
  }
  static async listAccessEvents(auth: AuthenticatedUser, q: AccessQuery) {
    const org = oid(q.organizationId);
    AuthorizationService.assertPermission(auth, "access-event.view", org);
    const f: Record<string, unknown> = {
      organizationId: org,
      ...(await securityScope(auth, org)),
    };
    if (q.propertyId) f.propertyId = oid(q.propertyId);
    if (q.accessPointId) f.accessPointId = oid(q.accessPointId);
    if (q.decision) f.decision = q.decision;
    if (q.from || q.to)
      f.occurredAt = {
        ...(q.from ? { $gte: q.from } : {}),
        ...(q.to ? { $lte: q.to } : {}),
      };
    return AccessEvent.find(f).sort({ occurredAt: -1 }).limit(q.limit).lean();
  }
  static async securitySummary(
    auth: AuthenticatedUser,
    organizationId: string,
  ) {
    const org = oid(organizationId);
    AuthorizationService.assertPermission(auth, "security-event.view", org);
    const scope = await securityScope(auth, org);
    const f: Record<string, unknown> = {
      organizationId: org,
      ...scope,
      status: { $in: ["OPEN", "ACKNOWLEDGED", "ESCALATED"] },
    };
    const [critical, high, open, offline, denied] = await Promise.all([
      SecurityEvent.countDocuments({ ...f, severity: "CRITICAL" }),
      SecurityEvent.countDocuments({ ...f, severity: "HIGH" }),
      SecurityEvent.countDocuments(f),
      SecurityCamera.countDocuments({
        organizationId: org,
        ...scope,
        status: { $in: ["OFFLINE", "DEGRADED"] },
      }),
      AccessEvent.countDocuments({
        organizationId: org,
        ...scope,
        decision: "DENIED",
        occurredAt: { $gte: new Date(Date.now() - 86400000) },
      }),
    ]);
    return {
      criticalOpenEvents: critical,
      highOpenEvents: high,
      totalOpenEvents: open,
      offlineCameras: offline,
      deniedAccessEvents24h: denied,
    };
  }
}
