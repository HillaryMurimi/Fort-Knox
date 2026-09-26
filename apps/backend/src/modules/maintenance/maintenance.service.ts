import { Types } from 'mongoose';
import { createHash, randomUUID } from 'node:crypto';
import { MaintenanceRequest } from '../../database/models/MaintenanceRequest.js';
import { MaintenanceApprovalPolicy } from '../../database/models/MaintenanceApprovalPolicy.js';
import { Contractor } from '../../database/models/Contractor.js';
import { Unit } from '../../database/models/Unit.js';
import { Tenant } from '../../database/models/Tenant.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { ResourceScopeService } from '../../core/authorization/resource-scope.service.js';
import { AppError } from '../../core/errors/AppError.js';
import { integrationConfig } from '../../core/integrations/config.js';
import { env } from '../../config/env.js';
import { getStorageProvider } from '../documents/storage.providers.js';
import { EvidenceService } from '../evidence/evidence.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import type { ApproveInput, AssignInput, CreateMaintenanceInput, PolicyInput, ProgressInput, QuoteInput, TriageInput, VerifyInput } from './maintenance.schemas.js';
import { assertMaintenanceMediaFiles } from './maintenance-media.middleware.js';

export class MaintenanceService {
  static async list(auth: AuthenticatedUser, organizationId: string) {
    const orgId = new Types.ObjectId(organizationId);
    const filter: Record<string, unknown> = { organizationId: orgId };
    if (hasContractorRole(auth, orgId)) {
      AuthorizationService.assertPermission(auth,'maintenance.view',orgId);
      const contractor = await Contractor.findOne({ organizationId: orgId, userId: auth.userId, status: 'ACTIVE' }).select('_id').lean();
      filter.$or = [
        { assignedToUserId: auth.userId },
        ...(contractor ? [{ contractorId: contractor._id }] : []),
      ];
    } else {
      const ids = await ResourceScopeService.scopedUnitIds(auth, orgId);
      if (ids) filter.unitId = { $in: ids };
    }
    return MaintenanceRequest.find(filter).sort({ priority: 1, createdAt: -1 }).lean();
  }
  private static async load(auth: AuthenticatedUser, id: string, permission: string) {
    const request = await MaintenanceRequest.findById(id); if (!request) throw new AppError(404,'NOT_FOUND','Maintenance request not found');
    let owner: Types.ObjectId | undefined; if (request.tenantId) { const tenant = await Tenant.findById(request.tenantId).lean(); owner = tenant?.userId; }
    if(hasContractorRole(auth,request.organizationId)){
      AuthorizationService.assertPermission(auth,permission,request.organizationId);
      const contractor=await Contractor.findOne({organizationId:request.organizationId,userId:auth.userId,status:'ACTIVE'}).select('_id').lean();
      if(!isMaintenanceAssignedToContractor(request,auth.userId,contractor?._id)) throw new AppError(403,'FORBIDDEN','Contractor access is limited to assigned maintenance jobs');
    } else {
      ResourceScopeService.assertUnit(auth, request, permission, owner);
    }
    return request;
  }
  static async get(auth: AuthenticatedUser, id: string) { return this.load(auth,id,'maintenance.view'); }
  static async create(auth: AuthenticatedUser, organizationId: string, data: CreateMaintenanceInput) {
    const orgId=new Types.ObjectId(organizationId); const unit=await Unit.findOne({_id:data.unitId,organizationId:orgId}).lean(); if(!unit) throw new AppError(404,'UNIT_NOT_FOUND','Unit not found in this organization');
    let tenantId: Types.ObjectId | undefined;
    if(data.tenantId){ const tenant=await Tenant.findOne({_id:data.tenantId,organizationId:orgId}).lean(); if(!tenant) throw new AppError(404,'TENANT_NOT_FOUND','Tenant not found in this organization'); tenantId=tenant._id; ResourceScopeService.assertUnit(auth,unit,'maintenance.create',tenant.userId); } else ResourceScopeService.assertUnit(auth,unit,'maintenance.create');
    const request=await MaintenanceRequest.create({...data,organizationId:orgId,propertyId:unit.propertyId,buildingId:unit.buildingId,floorId:unit.floorId,unitId:unit._id,tenantId,reportedByUserId:auth.userId,status:'NEW',createdBy:auth.userId,updatedBy:auth.userId});
    return request;
  }
  static async addEvidence(auth: AuthenticatedUser, id: string, files: Express.Multer.File[]) {
    assertMaintenanceMediaFiles(files);
    const request=await this.load(auth,id,'evidence.create');
    const provider=env.NODE_ENV!=='production'
      ? 'LOCAL' as const
      : integrationConfig.s3.bucket&&integrationConfig.s3.accessKeyId&&integrationConfig.s3.secretAccessKey
        ? 'S3' as const
        : null;
    if(!provider)throw new AppError(503,'EVIDENCE_STORAGE_UNAVAILABLE','Evidence storage is not configured');
    const storage=getStorageProvider(provider);
    const uploaded:Array<{key:string;file:Express.Multer.File}>=[];
    try{
      for(const file of files){
        const extension=extensionFor(file.mimetype);
        const key=`organizations/${request.organizationId}/maintenance/${request._id}/${randomUUID()}.${extension}`;
        const result=await storage.put({key,body:file.buffer,contentType:file.mimetype});
        uploaded.push({key:result.storageKey,file});
        await AuditService.record({organizationId:request.organizationId,actorUserId:auth.userId,action:'storage.object.uploaded',resourceType:'StorageObject',resourceId:request._id,propertyId:request.propertyId,buildingId:request.buildingId,unitId:request.unitId,metadata:{provider,key:result.storageKey,mimeType:file.mimetype,sizeBytes:file.size}});
      }
    }catch(error){
      await Promise.allSettled(uploaded.map(item=>storage.delete({key:item.key})));
      throw error instanceof AppError?error:new AppError(503,'EVIDENCE_UPLOAD_FAILED','The selected media could not be stored');
    }
    const evidence=[];
    for(const item of uploaded){
      const record=await EvidenceService.create(auth,String(request.organizationId),{
        propertyId:String(request.propertyId),buildingId:String(request.buildingId),floorId:String(request.floorId),unitId:String(request.unitId),ownerUserId:String(auth.userId),
        evidenceType:item.file.mimetype.startsWith('video/')?'VIDEO':'PHOTO',source:'MOBILE',capturedAt:new Date(),title:item.file.originalname.slice(0,240),storageKey:item.key,
        sha256:createHash('sha256').update(item.file.buffer).digest('hex'),mimeType:item.file.mimetype,sizeBytes:item.file.size,relatedResourceType:'MAINTENANCE',relatedResourceId:String(request._id),metadata:{storageProvider:provider,originalName:item.file.originalname},
      });
      evidence.push(record);
      request.evidenceIds.push(record._id);
    }
    request.updatedBy=new Types.ObjectId(auth.userId);
    await request.save();
    return evidence;
  }
  static async triage(auth: AuthenticatedUser,id:string,data:TriageInput){const r=await this.load(auth,id,'maintenance.assign'); if(!['NEW','TRIAGED'].includes(r.status)) throw new AppError(409,'INVALID_TRANSITION','Request cannot be triaged from its current state'); Object.assign(r,{...data,status:'TRIAGED',updatedBy:auth.userId}); await r.save(); return r;}
  static async assign(auth: AuthenticatedUser,id:string,data:AssignInput){const r=await this.load(auth,id,'maintenance.assign'); if(!['TRIAGED','ASSIGNED','QUOTED'].includes(r.status)) throw new AppError(409,'INVALID_TRANSITION','Request cannot be assigned from its current state'); if(data.contractorId){const c=await Contractor.findOne({_id:data.contractorId,organizationId:r.organizationId,status:'ACTIVE'}); if(!c) throw new AppError(404,'CONTRACTOR_NOT_FOUND','Active contractor not found'); r.contractorId=c._id;} if(data.assignedToUserId) r.assignedToUserId=new Types.ObjectId(data.assignedToUserId); r.status='ASSIGNED'; r.updatedBy=new Types.ObjectId(auth.userId); await r.save(); return r;}
  static async quote(auth:AuthenticatedUser,id:string,data:QuoteInput){const r=await this.load(auth,id,'maintenance.quote'); if(!['ASSIGNED','QUOTED'].includes(r.status)) throw new AppError(409,'INVALID_TRANSITION','Request is not ready for a quote'); r.quoteAmount=data.quoteAmount; r.evidenceIds=mergeEvidenceIds(r.evidenceIds,data.evidenceIds); const policy=await MaintenanceApprovalPolicy.findOne({organizationId:r.organizationId}).lean(); const threshold=policy?.approvalThreshold ?? 5000; const membership=auth.memberships.find(m=>String(m.organizationId)===String(r.organizationId)); const roleAuto=policy?.autoApproveRoles?.some(role=>membership?.roles.includes(role))===true; const emergencyAuto=policy?.emergencyAutoApprove===true && r.priority==='EMERGENCY'; r.approvalRequired=!(emergencyAuto || roleAuto || data.quoteAmount<=threshold); r.status=r.approvalRequired?'APPROVAL_REQUIRED':'APPROVED'; if(!r.approvalRequired){r.approvedAmount=data.quoteAmount;r.approvedBy=new Types.ObjectId(auth.userId);r.approvedAt=new Date();} r.resolutionNotes=data.notes; r.updatedBy=new Types.ObjectId(auth.userId); await r.save(); return r;}
  static async approve(auth:AuthenticatedUser,id:string,data:ApproveInput){const r=await this.load(auth,id,'maintenance.approve'); if(r.status!=='APPROVAL_REQUIRED') throw new AppError(409,'INVALID_TRANSITION','Request does not require approval'); const amount=data.approvedAmount ?? r.quoteAmount; if(amount===undefined) throw new AppError(400,'APPROVAL_AMOUNT_REQUIRED','An approval amount is required'); r.approvedAmount=amount;r.approvedBy=new Types.ObjectId(auth.userId);r.approvedAt=new Date();r.status='APPROVED';r.updatedBy=new Types.ObjectId(auth.userId);if(data.notes)r.resolutionNotes=data.notes;await r.save();return r;}
  static async progress(auth:AuthenticatedUser,id:string,data:ProgressInput){const r=await this.load(auth,id,'maintenance.close'); if(data.status==='IN_PROGRESS' && !['APPROVED','IN_PROGRESS'].includes(r.status)) throw new AppError(409,'INVALID_TRANSITION','Request cannot start work yet'); if(data.status==='COMPLETED' && !['IN_PROGRESS','APPROVED'].includes(r.status)) throw new AppError(409,'INVALID_TRANSITION','Request cannot be completed yet'); if(data.actualAmount!==undefined && typeof r.approvedAmount==='number' && data.actualAmount>r.approvedAmount) throw new AppError(409,'BUDGET_EXCEEDED','Actual maintenance cost exceeds the approved amount; obtain an updated approval before completion'); if(data.actualAmount!==undefined)r.actualAmount=data.actualAmount; r.evidenceIds=mergeEvidenceIds(r.evidenceIds,data.evidenceIds); r.resolutionNotes=data.resolutionNotes; r.status=data.status; if(data.status==='COMPLETED')r.completedAt=new Date();r.updatedBy=new Types.ObjectId(auth.userId);await r.save();return r;}
  static async verify(auth:AuthenticatedUser,id:string,data:VerifyInput){const r=await this.load(auth,id,'maintenance.close'); if(r.status!=='COMPLETED') throw new AppError(409,'INVALID_TRANSITION','Only completed requests can be verified'); r.status='VERIFIED';r.verifiedAt=new Date();if(data.notes)r.resolutionNotes=data.notes;r.updatedBy=new Types.ObjectId(auth.userId);await r.save();return r;}
  static async close(auth:AuthenticatedUser,id:string){const r=await this.load(auth,id,'maintenance.close'); if(r.status!=='VERIFIED') throw new AppError(409,'INVALID_TRANSITION','Only verified requests can be closed'); r.status='CLOSED';r.closedAt=new Date();r.updatedBy=new Types.ObjectId(auth.userId);await r.save();return r;}
  static async getPolicy(auth:AuthenticatedUser,organizationId:string){const orgId=new Types.ObjectId(organizationId);AuthorizationService.assertPermission(auth,'maintenance.policy.view',orgId);return MaintenanceApprovalPolicy.findOne({organizationId:orgId}).lean();}
  static async setPolicy(auth:AuthenticatedUser,organizationId:string,data:PolicyInput){const orgId=new Types.ObjectId(organizationId);AuthorizationService.assertPermission(auth,'maintenance.policy.manage',orgId);return MaintenanceApprovalPolicy.findOneAndUpdate({organizationId:orgId},{...data,organizationId:orgId,updatedBy:auth.userId},{upsert:true,new:true,setDefaultsOnInsert:true}).lean();}
}

function hasContractorRole(auth:AuthenticatedUser,organizationId:Types.ObjectId):boolean{
  return !auth.isPlatformAdmin && auth.memberships.some(m=>String(m.organizationId)===String(organizationId)&&m.roles.includes('CONTRACTOR'));
}

export function isMaintenanceAssignedToContractor(
  request:{contractorId?:Types.ObjectId|null;assignedToUserId?:Types.ObjectId|null},
  userId:Types.ObjectId,
  contractorId?:Types.ObjectId|null,
):boolean{
  return Boolean(
    (request.assignedToUserId&&String(request.assignedToUserId)===String(userId)) ||
    (request.contractorId&&contractorId&&String(request.contractorId)===String(contractorId)),
  );
}

export function mergeEvidenceIds(existing:Types.ObjectId[],incoming:string[]):Types.ObjectId[]{
  return [...new Set([...existing.map(String),...incoming])].map(value=>new Types.ObjectId(value));
}

function extensionFor(mimeType:string):string{
  const extensions:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/heic':'heic','image/heif':'heif','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov'};
  const extension=extensions[mimeType];
  if(!extension)throw new AppError(400,'UNSUPPORTED_MAINTENANCE_MEDIA','Unsupported photo or video type');
  return extension;
}
