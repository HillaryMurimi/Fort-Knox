import { Types, type ClientSession } from 'mongoose';
import { AuditLog } from '../../database/models/AuditLog.js';
import { DomainEvent } from '../../database/models/DomainEvent.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import { AppError } from '../../core/errors/AppError.js';
import { EventStore, type EventInput } from './event-store.js';

export interface AuditInput { 
  organizationId?: Types.ObjectId | undefined; 
  actorUserId?: Types.ObjectId | undefined; 
  actorRole?: string | undefined; 
  action:string; 
  resourceType:string; 
  resourceId?:Types.ObjectId | undefined; 
  propertyId?:Types.ObjectId | null | undefined;
  buildingId?: Types.ObjectId | null | undefined;
  unitId?: Types.ObjectId | null | undefined; 
  requestId?:string | undefined; 
  ipAddress?:string | undefined; 
  userAgent?:string | undefined; 
  before?:unknown;
  after?:unknown; 
  metadata?:Record<string,unknown> | undefined; 
}
export class AuditService {
  static async record(input:AuditInput, session?:ClientSession){
    const entry={...input,occurredAt:new Date()};
    if(session){const [created]=await AuditLog.create([entry],{session});return created;}
    return AuditLog.create(entry);
  }
  static async list(auth:AuthenticatedUser, query:{organizationId:string;resourceType?:string;resourceId?:string;actorUserId?:string;action?:string;from?:Date;to?:Date;limit:number}){
    const orgId=new Types.ObjectId(query.organizationId); AuthorizationService.assertPermission(auth,'audit.view',orgId);
    const filter:Record<string,unknown>={organizationId:orgId}; if(query.resourceType)filter.resourceType=query.resourceType; if(query.resourceId)filter.resourceId=new Types.ObjectId(query.resourceId); if(query.actorUserId)filter.actorUserId=new Types.ObjectId(query.actorUserId); if(query.action)filter.action=query.action; if(query.from||query.to)filter.occurredAt={...(query.from?{$gte:query.from}:{}),...(query.to?{$lte:query.to}:{})};
    return AuditLog.find(filter).sort({occurredAt:-1}).limit(query.limit).lean();
  }
  static async publish(input:EventInput){
    return EventStore.append(input);
  }
  static async listEvents(auth:AuthenticatedUser, query:{organizationId:string;name?:string;aggregateType?:string;aggregateId?:string;from?:Date;to?:Date;limit:number}){
    const orgId=new Types.ObjectId(query.organizationId); AuthorizationService.assertPermission(auth,'audit.view',orgId);
    const filter:Record<string,unknown>={organizationId:orgId}; if(query.name)filter.name=query.name; if(query.aggregateType)filter.aggregateType=query.aggregateType; if(query.aggregateId)filter.aggregateId=new Types.ObjectId(query.aggregateId); if(query.from||query.to)filter.occurredAt={...(query.from?{$gte:query.from}:{}),...(query.to?{$lte:query.to}:{})};
    return DomainEvent.find(filter).sort({occurredAt:-1}).limit(query.limit).lean();
  }
  static assertObjectId(value:string, field:string){if(!Types.ObjectId.isValid(value))throw new AppError(400,'INVALID_ID',`Invalid ${field}`); return new Types.ObjectId(value);}
}
