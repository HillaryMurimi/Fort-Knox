import { Types } from 'mongoose';
import { Inspection } from '../../database/models/Inspection.js';
import { Unit } from '../../database/models/Unit.js';
import { Tenancy } from '../../database/models/Tenancy.js';
import { MaintenanceRequest } from '../../database/models/MaintenanceRequest.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { ResourceScopeService } from '../../core/authorization/resource-scope.service.js';
import { AppError } from '../../core/errors/AppError.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import type { CompleteInspectionInput, CreateInspectionInput } from './inspection.schemas.js';
export class InspectionService {
 static async list(auth:AuthenticatedUser,organizationId:string){const orgId=new Types.ObjectId(organizationId);const ids=await ResourceScopeService.scopedUnitIds(auth,orgId);const f:Record<string,unknown>={organizationId:orgId};if(ids)f.unitId={$in:ids};return Inspection.find(f).sort({createdAt:-1}).lean();}
 static async load(auth:AuthenticatedUser,id:string,permission='inspection.view'){const i=await Inspection.findById(id);if(!i)throw new AppError(404,'NOT_FOUND','Inspection not found');ResourceScopeService.assertUnit(auth,i,permission);return i;}
 static async create(auth:AuthenticatedUser,organizationId:string,data:CreateInspectionInput){const orgId=new Types.ObjectId(organizationId);const unit=await Unit.findOne({_id:data.unitId,organizationId:orgId}).lean();if(!unit)throw new AppError(404,'UNIT_NOT_FOUND','Unit not found');ResourceScopeService.assertUnit(auth,unit,'inspection.create');if(data.tenancyId){const t=await Tenancy.findOne({_id:data.tenancyId,organizationId:orgId,unitId:unit._id}).lean();if(!t)throw new AppError(404,'TENANCY_NOT_FOUND','Tenancy does not belong to this unit');}if(data.maintenanceRequestId){const m=await MaintenanceRequest.findOne({_id:data.maintenanceRequestId,organizationId:orgId,unitId:unit._id}).lean();if(!m)throw new AppError(404,'MAINTENANCE_NOT_FOUND','Maintenance request does not belong to this unit');}return Inspection.create({...data,organizationId:orgId,propertyId:unit.propertyId,buildingId:unit.buildingId,floorId:unit.floorId,unitId:unit._id,status:'DRAFT',inspectedBy:auth.userId,createdBy:auth.userId,updatedBy:auth.userId});}
 static async complete(auth:AuthenticatedUser,id:string,data:CompleteInspectionInput){const i=await this.load(auth,id,'inspection.complete');if(!['DRAFT','IN_PROGRESS'].includes(i.status))throw new AppError(409,'INVALID_TRANSITION','Inspection cannot be completed from its current state');if(data.overallCondition)i.overallCondition=data.overallCondition;if(data.notes)i.notes=data.notes;if(data.evidenceIds.length)i.evidenceIds=data.evidenceIds.map(x=>new Types.ObjectId(x));i.status='COMPLETED';i.completedAt=new Date();i.updatedBy=new Types.ObjectId(auth.userId);await i.save();return i;}
 static async get(auth:AuthenticatedUser,id:string){return this.load(auth,id,'inspection.view');}
}
