import { Schema, model, type InferSchemaType } from 'mongoose';
const schema=new Schema({
 organizationId:{type:Schema.Types.ObjectId,ref:'Organization',required:true,unique:true,index:true},
 enabled:{type:Boolean,default:false}, mode:{type:String,enum:['SHADOW','CANARY','ACTIVE'],default:'SHADOW'},
 canaryPercent:{type:Number,min:0,max:100,default:0}, minConfidence:{type:Number,min:0,max:1,default:.75},
 mlActionMinConfidence:{type:Number,min:0,max:1,default:.85}, requireValidation:{type:Boolean,default:true},
 maxDriftPsi:{type:Number,min:0,default:.2}, maxPerformanceDegradation:{type:Number,min:0,max:1,default:.15}, autoRollbackOnCriticalDrift:{type:Boolean,default:true}, autoRollbackOnPerformanceDegradation:{type:Boolean,default:false}, approvalValidityHours:{type:Number,min:1,max:720,default:24},
 domains:{ type:{ARREARS:Boolean,VACANCY:Boolean,REVENUE:Boolean}, default:{ARREARS:true,VACANCY:true,REVENUE:true}},
 updatedBy:{type:Schema.Types.ObjectId,ref:'User'}, lastEvaluatedAt:Date
},{timestamps:true});
export type ModelServingPolicyDocument=InferSchemaType<typeof schema>; export const ModelServingPolicy=model('ModelServingPolicy',schema);
