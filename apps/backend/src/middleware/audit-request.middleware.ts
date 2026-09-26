import type { RequestHandler } from 'express';
import { Types } from 'mongoose';
import { AuditService } from '../modules/audit/audit.service.js';

export const auditRequestMiddleware: RequestHandler = (req, res, next) => {
  res.on('finish', () => {
    if (!req.auth || req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
    if (req.path.includes('/audit-logs') || req.path.includes('/domain-events')) return;
    const rawOrg = typeof req.params.organizationId === 'string' ? req.params.organizationId : undefined;
    const organizationId = rawOrg && Types.ObjectId.isValid(rawOrg) ? new Types.ObjectId(rawOrg) : undefined;
    const candidateResource = req.params.id ?? req.params.documentId ?? req.params.notificationId ?? req.params.maintenanceId;
    const rawResource = typeof candidateResource === 'string' ? candidateResource : undefined;
    const resourceId = rawResource && Types.ObjectId.isValid(rawResource) ? new Types.ObjectId(rawResource) : undefined;
    const resourceType = req.path.split('/').filter(Boolean)[0] ?? 'HTTP';
    void AuditService.record({
      organizationId,
      actorUserId: req.auth.userId,
      actorRole: req.auth.isPlatformAdmin ? 'SUPER_ADMIN' : undefined,
      action: `http.${req.method.toLowerCase()}`,
      resourceType,
      resourceId,
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
      metadata: { path: req.path, statusCode: res.statusCode }
    }).catch(() => undefined);
  });
  next();
};
