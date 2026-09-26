import { api } from '../api';
import type { AccessEvent, AccessPoint, Incident, SecurityCamera, SecurityEvent, SecuritySummary } from './resource-types';
import { toQueryString, type QueryValue } from './query-params';

export interface CreateCameraInput {
  propertyId: string;
  buildingId?: string;
  floorId?: string;
  unitId?: string;
  name: string;
  cameraCode: string;
  provider: string;
  connectionType: SecurityCamera['connectionType'];
  capabilities?: string[];
  streamRef?: string;
  playbackRef?: string;
  metadata?: Record<string, unknown>;
}

export type UpdateCameraInput = Partial<CreateCameraInput> & {
  status?: SecurityCamera['status'];
  lastSeenAt?: string;
  lastHeartbeatAt?: string;
};

export type SecurityEventQuery = {
  propertyId?: string;
  cameraId?: string;
  status?: string;
  severity?: string;
  from?: string;
  to?: string;
  limit?: number;
};

export interface CreateSecurityEventInput {
  propertyId: string;
  buildingId?: string;
  floorId?: string;
  unitId?: string;
  cameraId?: string;
  type: SecurityEvent['type'];
  severity: SecurityEvent['severity'];
  detectedAt: string;
  source: SecurityEvent['source'];
  confidence?: number;
  description?: string;
  metadata?: Record<string, unknown>;
  snapshotEvidenceIds?: string[];
}

export interface SecurityEventUpdateInput {
  status: Exclude<SecurityEvent['status'], 'OPEN'>;
  notes?: string;
}

export type IncidentQuery = {
  propertyId?: string;
  status?: string;
  severity?: string;
  from?: string;
  to?: string;
  limit?: number;
};

export interface CreateIncidentInput {
  propertyId: string;
  buildingId?: string;
  floorId?: string;
  unitId?: string;
  title: string;
  description?: string;
  category: Incident['category'];
  severity: Incident['severity'];
  reportedAt?: string;
  sourceEventIds?: string[];
  evidenceIds?: string[];
  documentIds?: string[];
  assignedToUserId?: string;
  metadata?: Record<string, unknown>;
}

export interface IncidentUpdateInput {
  status: Exclude<Incident['status'], 'OPEN'>;
  notes?: string;
}

export interface CreateAccessPointInput {
  propertyId: string;
  buildingId?: string;
  floorId?: string;
  unitId?: string;
  name: string;
  pointCode: string;
  type: AccessPoint['type'];
  provider?: string;
  deviceRef?: string;
  metadata?: Record<string, unknown>;
}

export type UpdateAccessPointInput = Partial<CreateAccessPointInput> & {
  status?: AccessPoint['status'];
};

export type AccessEventQuery = {
  propertyId?: string;
  accessPointId?: string;
  decision?: string;
  from?: string;
  to?: string;
  limit?: number;
};

export interface CreateAccessEventInput {
  propertyId: string;
  buildingId?: string;
  floorId?: string;
  unitId?: string;
  accessPointId: string;
  userId?: string;
  tenantId?: string;
  eventType: AccessEvent['eventType'];
  decision: AccessEvent['decision'];
  credentialType: AccessEvent['credentialType'];
  occurredAt: string;
  credentialRef?: string;
  reason?: string;
  evidenceIds?: string[];
  metadata?: Record<string, unknown>;
}

function qs(values: Record<string, QueryValue>): string {
  const value = toQueryString(values);
  return value ? `?${value}` : '';
}

export const securityClient = {
  cameras: {
    list: (organizationId: string) =>
      api<SecurityCamera[]>(`/organizations/${organizationId}/cctv/cameras`),
    create: (organizationId: string, input: CreateCameraInput) =>
      api<SecurityCamera>(`/organizations/${organizationId}/cctv/cameras`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    getLive: (cameraId: string) =>
      api<unknown>(`/cctv/cameras/${cameraId}/live`),
    getPlayback: (cameraId: string, from?: string, to?: string) =>
      api<unknown>(`/cctv/cameras/${cameraId}/playback${qs({ from, to })}`),
    update: (cameraId: string, input: UpdateCameraInput) =>
      api<SecurityCamera>(`/cctv/cameras/${cameraId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
  },
  events: {
    list: (organizationId: string, params: SecurityEventQuery = {}) =>
      api<SecurityEvent[]>(
        `/organizations/${organizationId}/security/events${qs(params)}`,
      ),
    create: (organizationId: string, input: CreateSecurityEventInput) =>
      api<SecurityEvent>(`/organizations/${organizationId}/security/events`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    update: (eventId: string, input: SecurityEventUpdateInput) =>
      api<SecurityEvent>(`/security/events/${eventId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    summary: (organizationId: string) =>
      api<SecuritySummary>(`/organizations/${organizationId}/security/summary`),
  },
  incidents: {
    list: (organizationId: string, params: IncidentQuery = {}) =>
      api<Incident[]>(`/organizations/${organizationId}/incidents${qs(params)}`),
    create: (organizationId: string, input: CreateIncidentInput) =>
      api<Incident>(`/organizations/${organizationId}/incidents`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    update: (incidentId: string, input: IncidentUpdateInput) =>
      api<Incident>(`/incidents/${incidentId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
  },
  accessPoints: {
    list: (organizationId: string) =>
      api<AccessPoint[]>(`/organizations/${organizationId}/access-points`),
    create: (organizationId: string, input: CreateAccessPointInput) =>
      api<AccessPoint>(`/organizations/${organizationId}/access-points`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    update: (pointId: string, input: UpdateAccessPointInput) =>
      api<AccessPoint>(`/access-points/${pointId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
  },
  accessEvents: {
    list: (organizationId: string, params: AccessEventQuery = {}) =>
      api<AccessEvent[]>(
        `/organizations/${organizationId}/access-events${qs(params)}`,
      ),
    create: (organizationId: string, input: CreateAccessEventInput) =>
      api<AccessEvent>(`/organizations/${organizationId}/access-events`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  },
};