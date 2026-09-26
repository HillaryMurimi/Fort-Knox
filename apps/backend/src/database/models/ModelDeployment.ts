import { Schema, model, type InferSchemaType } from 'mongoose';
const schema=new Schema({
 organizationId:{type:Schema.Types.ObjectId,ref:'Organization',required:true,index:true}, domain:{type:String,enum:['ARREARS','VACANCY','REVENUE'],required:true,index:true},
 championModelId:{type:Schema.Types.ObjectId,ref:'PredictiveModel',required:true}, challengerModelId:{type:Schema.Types.ObjectId,ref:'PredictiveModel'},
 mode:{type:String,enum:['SHADOW','CANARY','ACTIVE'],required:true}, canaryPercent:{type:Number,min:0,max:100,default:0},
 championVersion:{type:String,required:true}, challengerVersion:{type:String}, championMetrics:{type:Map,of:Number,default:()=>({})}, challengerMetrics:{type:Map,of:Number,default:()=>({})},
 activatedAt:Date, rolledBackAt:Date, rollbackReason:String, updatedBy:{type:Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});
schema.index({organizationId:1,domain:1},{unique:true});
export type ModelDeploymentDocument=InferSchemaType<typeof schema>; export const ModelDeployment=model('ModelDeployment',schema);
