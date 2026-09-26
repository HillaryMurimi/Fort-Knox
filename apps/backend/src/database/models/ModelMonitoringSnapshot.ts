import { Schema, model, type InferSchemaType } from 'mongoose';
const schema=new Schema({
 organizationId:{type:Schema.Types.ObjectId,ref:'Organization',required:true,index:true}, domain:{type:String,enum:['ARREARS','VACANCY','REVENUE'],required:true,index:true}, modelVersion:{type:String,required:true,index:true},
 windowStart:{type:Date,required:true}, windowEnd:{type:Date,required:true}, predictionCount:{type:Number,required:true}, outcomeCount:{type:Number,required:true},
 featureDrift:{type:Map,of:Number,default:()=>({})}, maxPsi:{type:Number,default:0}, performance:{type:Map,of:Number,default:()=>({})}, baselinePerformance:{type:Map,of:Number,default:()=>({})},
 driftStatus:{type:String,enum:['HEALTHY','WARNING','CRITICAL'],required:true}, performanceStatus:{type:String,enum:['HEALTHY','WARNING','CRITICAL'],required:true}, overallStatus:{type:String,enum:['HEALTHY','WARNING','CRITICAL'],required:true},
 recommendation:{type:String,enum:['KEEP','REVIEW','ROLLBACK','DISABLE'],required:true}, evaluatedAt:{type:Date,required:true}, metadata:{type:Map,of:Schema.Types.Mixed,default:()=>({})}
},{timestamps:true});
schema.index({organizationId:1,domain:1,modelVersion:1,windowEnd:-1});
export type ModelMonitoringSnapshotDocument=InferSchemaType<typeof schema>; export const ModelMonitoringSnapshot=model('ModelMonitoringSnapshot',schema);
