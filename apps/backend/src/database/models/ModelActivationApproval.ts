import { Schema, model, type InferSchemaType } from 'mongoose';
const schema=new Schema({
 organizationId:{type:Schema.Types.ObjectId,ref:'Organization',required:true,index:true}, domain:{type:String,enum:['ARREARS','VACANCY','REVENUE'],required:true,index:true},
 deploymentId:{type:Schema.Types.ObjectId,ref:'ModelDeployment',required:true}, modelVersion:{type:String,required:true}, mode:{type:String,enum:['CANARY','ACTIVE'],required:true},
 status:{type:String,enum:['PENDING','APPROVED','REJECTED','EXPIRED','REVOKED'],default:'PENDING',index:true}, requestedBy:{type:Schema.Types.ObjectId,ref:'User',required:true}, approvedBy:{type:Schema.Types.ObjectId,ref:'User'}, requestedAt:{type:Date,default:Date.now}, approvedAt:Date, expiresAt:Date, reason:String, metadata:{type:Map,of:Schema.Types.Mixed,default:()=>({})}
},{timestamps:true});
schema.index({organizationId:1,domain:1,status:1});
export type ModelActivationApprovalDocument=InferSchemaType<typeof schema>; export const ModelActivationApproval=model('ModelActivationApproval',schema);
