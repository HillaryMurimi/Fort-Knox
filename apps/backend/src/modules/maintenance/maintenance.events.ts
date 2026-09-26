import type { Types } from 'mongoose';

export type MaintenanceDomainEventName =
  | 'maintenance.created'
  | 'maintenance.assigned'
  | 'maintenance.quote_submitted'
  | 'maintenance.approved'
  | 'maintenance.completed'
  | 'maintenance.verified'
  | 'maintenance.closed';

export interface MaintenanceFinancialPayload {
  maintenanceRequestId: Types.ObjectId;
  organizationId: Types.ObjectId;
  propertyId: Types.ObjectId;
  buildingId: Types.ObjectId;
  unitId: Types.ObjectId;
  quoteAmount?: number;
  approvedAmount?: number;
  actualAmount?: number;
  currency: string;
}

export interface MaintenanceHealthPayload {
  maintenanceRequestId: Types.ObjectId;
  organizationId: Types.ObjectId;
  propertyId: Types.ObjectId;
  buildingId: Types.ObjectId;
  unitId: Types.ObjectId;
  category: string;
  priority: string;
  status: string;
  actualAmount?: number;
  completedAt?: Date;
}

export interface MaintenanceDomainEvent<TPayload> {
  name: MaintenanceDomainEventName;
  occurredAt: Date;
  actorUserId: Types.ObjectId;
  payload: TPayload;
}

export const toFinancialPayload = (
  request: {
    _id: Types.ObjectId;
    organizationId: Types.ObjectId;
    propertyId: Types.ObjectId;
    buildingId: Types.ObjectId;
    unitId: Types.ObjectId;
    quoteAmount?: number;
    approvedAmount?: number;
    actualAmount?: number;
  },
  currency: string
): MaintenanceFinancialPayload => ({
  maintenanceRequestId: request._id,
  organizationId: request.organizationId,
  propertyId: request.propertyId,
  buildingId: request.buildingId,
  unitId: request.unitId,
  quoteAmount: request.quoteAmount,
  approvedAmount: request.approvedAmount,
  actualAmount: request.actualAmount,
  currency
});
