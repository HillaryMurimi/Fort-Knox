import { Schema, model, type InferSchemaType } from 'mongoose';
const schema=new Schema({
 organizationId:{type:Schema.Types.ObjectId,ref:'Organization',required:true,index:true}, domain:{type:String,enum:['ARREARS','VACANCY','REVENUE'],required:true,index:true}, modelVersion:String,
 type:{type:String,enum:['DRIFT','PERFORMANCE_DEGRADATION','LOW_CONFIDENCE','SERVING_ERROR','DATA_QUALITY','MANUAL_KILL_SWITCH'],required:true,index:true}, severity:{type:String,enum:['LOW','MEDIUM','HIGH','CRITICAL'],required:true}, status:{type:String,enum:['OPEN','ACKNOWLEDGED','RESOLVED','DISMISSED'],default:'OPEN',index:true},
 detectedAt:{type:Date,default:Date.now}, resolvedAt:Date, detectedBy:{type:Schema.Types.ObjectId,ref:'User'}, resolvedBy:{type:Schema.Types.ObjectId,ref:'User'}, title:{type:String,required:true}, description:{type:String,required:true}, metrics:{type:Map,of:Number,default:()=>({})}, metadata:{type:Map,of:Schema.Types.Mixed,default:()=>({})}
},{timestamps:true});
schema.index({organizationId:1,domain:1,status:1,detectedAt:-1});
export type ModelSafetyIncidentDocument=InferSchemaType<typeof schema>; export const ModelSafetyIncident=model('ModelSafetyIncident',schema);
