import { Types } from 'mongoose'; import { randomUUID } from 'node:crypto';
import { Job } from '../../database/models/Job.js'; import { NotificationService } from '../notifications/notification.service.js'; import { AuthorizationService } from '../../core/authorization/authorization.service.js'; import { AppError } from '../../core/errors/AppError.js'; import type { AuthenticatedUser } from '../../core/types/auth.js'; import type { z } from 'zod'; import type { enqueueJobSchema, jobQuerySchema } from './job.schemas.js'; import { paginationMeta, paginationSkip } from '../../core/api/pagination.js';
type EnqueueInput=z.infer<typeof enqueueJobSchema>; type QueryInput=z.infer<typeof jobQuerySchema>;
export class JobService {
  static async list(auth:AuthenticatedUser,organizationId:string,query:QueryInput){const org=new Types.ObjectId(organizationId);AuthorizationService.assertPermission(auth,'job.view',org);const filter={organizationId:org,...(query.status?{status:query.status}:{}),...(query.type?{type:query.type}:{})};const total=await Job.countDocuments(filter);const data=await Job.find(filter).sort({priority:-1,availableAt:1}).skip(paginationSkip(query)).limit(query.pageSize).lean();return {data,meta:{pagination:paginationMeta(total,query)}};}
  static async enqueue(auth:AuthenticatedUser,data:EnqueueInput){if(data.organizationId){const org=new Types.ObjectId(data.organizationId);AuthorizationService.assertPermission(auth,'job.manage',org);}else if(!auth.isPlatformAdmin)throw new AppError(403,'FORBIDDEN','Organization is required');return Job.create({organizationId:data.organizationId?new Types.ObjectId(data.organizationId):undefined,type:data.type,payload:data.payload,priority:data.priority,availableAt:data.availableAt??new Date(),maxAttempts:data.maxAttempts,dedupeKey:data.dedupeKey,createdBy:auth.userId,status:'QUEUED'});}
  static async recoverExpiredLeases(leaseMinutes = 10) {
    const cutoff = new Date(Date.now() - leaseMinutes * 60_000);
    return Job.updateMany(
      { status: 'RUNNING', $or: [{ leaseExpiresAt: { $lte: new Date() } }, { lockedAt: { $lte: cutoff } }] },
      { $set: { status: 'QUEUED', availableAt: new Date(), lockedAt: undefined, lockedBy: undefined, leaseExpiresAt: undefined, lastError: 'Worker lease expired; job re-queued' } },
    );
  }

  static async runDueJobs(limit=25,workerId=randomUUID()){
    await this.recoverExpiredLeases();
    const results:Array<{jobId:string;status:string}> = [];
    for(let i=0;i<limit;i++){
      const job=await Job.findOneAndUpdate({status:'QUEUED',availableAt:{$lte:new Date()}},{$set:{status:'RUNNING',lockedAt:new Date(),lockedBy:workerId,leaseExpiresAt:new Date(Date.now()+10*60_000),startedAt:new Date()},$inc:{attempts:1}},{new:true,sort:{priority:-1,availableAt:1}}); if(!job)break;
      try { await this.execute(job); job.status='SUCCEEDED';job.completedAt=new Date();job.set('lockedAt', undefined);job.set('lockedBy', undefined);job.set('leaseExpiresAt', undefined);await job.save();results.push({jobId:String(job._id),status:'SUCCEEDED'}); }
      catch(error){const message=error instanceof Error?error.message:'Unknown job failure'; if(job.attempts<job.maxAttempts){job.status='QUEUED';job.availableAt=new Date(Date.now()+Math.min(3600000,2**job.attempts*1000));job.lastError=message;}else{job.status='DEAD_LETTER';job.failedAt=new Date();job.deadLetteredAt=new Date();job.lastError=message;}job.set('lockedAt', undefined);job.set('lockedBy', undefined);job.set('leaseExpiresAt', undefined);await job.save();results.push({jobId:String(job._id),status:job.status});}
    } return results;
  }
  private static async execute(job: {type:string;payload:unknown;organizationId?:Types.ObjectId | null}){
    if(job.type==='domain-event.payment-activity'){
      const p=job.payload as {eventId?:unknown};
      if(typeof p?.eventId!=='string'||!job.organizationId)throw new AppError(400,'INVALID_JOB_PAYLOAD','Event id and organization are required');
      await (await import('../audit/event-delivery.service.js')).EventDeliveryService.consume(p.eventId,job.organizationId);
      return;
    }
    if(job.type==='notification.send'){const p=job.payload as {notificationId:string};if(!Types.ObjectId.isValid(p.notificationId))throw new AppError(400,'INVALID_JOB_PAYLOAD','Invalid notification id');const n=await import('../../database/models/Notification.js').then(m=>m.Notification.findById(p.notificationId));if(!n)throw new AppError(404,'NOTIFICATION_NOT_FOUND','Notification not found');await (await import('../../core/integrations/dispatcher.js')).IntegrationDispatcher.sendNotification(n);return;}
    if(job.type==='intelligence.evaluate'){const p=job.payload as {organizationId:string;from?:string;to?:string};if(!Types.ObjectId.isValid(p.organizationId))throw new AppError(400,'INVALID_JOB_PAYLOAD','Invalid organization id');const to=p.to?new Date(p.to):new Date();const from=p.from?new Date(p.from):new Date(to.getFullYear(),to.getMonth(),1);await (await import('../command-center/command-center.service.js')).CommandCenterService.evaluateOrganization(new Types.ObjectId(p.organizationId),from,to);return;}
    if(job.type==='predictive-learning.label-outcomes'){
      const p=job.payload as {organizationId:string;horizonDays?:number};
      if(!Types.ObjectId.isValid(p.organizationId))throw new AppError(400,'INVALID_JOB_PAYLOAD','Invalid organization id');
      const {PredictiveLearningService}=await import('../predictive-learning/predictive-learning.service.js');
      await PredictiveLearningService.labelSystem(new Types.ObjectId(p.organizationId),new Date(),p.horizonDays??30);
      return;
    }
    if(job.type==='predictive-learning.train'){
      const p=job.payload as {organizationId:string;minSamples?:number};
      if(!Types.ObjectId.isValid(p.organizationId))throw new AppError(400,'INVALID_JOB_PAYLOAD','Invalid organization id');
      const {PredictiveLearningService}=await import('../predictive-learning/predictive-learning.service.js');
      await PredictiveLearningService.trainSystem(new Types.ObjectId(p.organizationId),undefined,p.minSamples??50);
      return;
    }
    if(job.type==='model-serving.monitor'){
      const p=job.payload as {organizationId:string;windowDays?:number};
      if(!Types.ObjectId.isValid(p.organizationId))throw new AppError(400,'INVALID_JOB_PAYLOAD','Invalid organization id');
      const {ModelServingService}=await import('../model-serving/model-serving.service.js');
      await ModelServingService.monitorSystem(new Types.ObjectId(p.organizationId),p.windowDays??30); return;
    }
    if(job.type==='decision-automation.evaluate'){
      const p=job.payload as {organizationId:string;from?:string;to?:string;trigger?:'SCHEDULED'|'JOB'};
      if(!Types.ObjectId.isValid(p.organizationId))throw new AppError(400,'INVALID_JOB_PAYLOAD','Invalid organization id');
      const to=p.to?new Date(p.to):new Date();
      const from=p.from?new Date(p.from):new Date(to.getTime()-30*86_400_000);
      await (await import('../decision-automation/decision-automation.service.js')).DecisionAutomationService.evaluateSystem(new Types.ObjectId(p.organizationId),{from,to,trigger:p.trigger??'JOB'});
      return;
    }
    if(job.type==='billing.reconcile'){await (await import('../billing/billing.service.js')).BillingService.reconcile();return;}
    if(job.type==='payment.provider-reconcile'){const p=job.payload as {paymentId:string};if(!Types.ObjectId.isValid(p.paymentId))throw new AppError(400,'INVALID_JOB_PAYLOAD','Invalid payment id');await (await import('../integrations/integration.service.js')).IntegrationService.reconcilePaymentSystem(p.paymentId);return;}
    if(job.type==='notification.dispatch_due'){const {Notification}=await import('../../database/models/Notification.js');const due=await Notification.find({status:'QUEUED',scheduledFor:{$lte:new Date()}}).limit(100);for(const n of due){await Job.create({organizationId:n.organizationId,type:'notification.send',payload:{notificationId:String(n._id)},availableAt:new Date(),priority:n.priority==='URGENT'?10:n.priority==='HIGH'?5:0,maxAttempts:5,dedupeKey:`notification:${n._id.toString()}`});}return;}
    throw new AppError(400,'UNKNOWN_JOB_TYPE',`Unsupported job type: ${job.type}`);
  }
}
