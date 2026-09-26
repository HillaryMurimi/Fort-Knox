import { Schema, model, type InferSchemaType } from 'mongoose';
const schema=new Schema({
 organizationId:{type:Schema.Types.ObjectId,ref:'Organization',required:true,index:true}, startedAt:{type:Date,required:true,index:true}, completedAt:Date, status:{type:String,enum:['RUNNING','SUCCEEDED','FAILED'],required:true,index:true}, trigger:{type:String,enum:['MANUAL','SCHEDULED','JOB'],required:true}, evaluatedProperties:{type:Number,default:0}, actionsCreated:{type:Number,default:0}, actionsEscalated:{type:Number,default:0}, notificationsQueued:{type:Number,default:0}, tenantRisksUpdated:{type:Number,default:0}, vacancyForecastsUpdated:{type:Number,default:0}, revenueForecastsUpdated:{type:Number,default:0}, error:{type:String,maxlength:5000}, metadata:{type:Map,of:Schema.Types.Mixed,default:()=>({})}
},{timestamps:true});
schema.index({organizationId:1,startedAt:-1});
export type DecisionAutomationRunDocument=InferSchemaType<typeof schema>;
export const DecisionAutomationRun=model('DecisionAutomationRun',schema);
