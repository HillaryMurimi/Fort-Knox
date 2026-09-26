import { Schema, model, type InferSchemaType } from 'mongoose';

const schema=new Schema({
 organizationId:{type:Schema.Types.ObjectId,ref:'Organization',required:true,index:true},
 entityType:{type:String,enum:['TENANT','UNIT','PROPERTY'],required:true,index:true}, entityId:{type:Schema.Types.ObjectId,required:true,index:true},
 observationAt:{type:Date,required:true,index:true}, modelDomain:{type:String,enum:['ARREARS','VACANCY','REVENUE'],required:true,index:true}, modelVersion:{type:String,required:true},
 features:{type:Map,of:Number,default:()=>({})}, prediction:{type:Number,min:0}, confidence:{type:Number,min:0,max:1}, outcome:{type:Number}, outcomeObservedAt:Date, labelStatus:{type:String,enum:['PENDING','OBSERVED','CENSORED'],default:'PENDING',index:true}, metadata:{type:Map,of:Schema.Types.Mixed,default:()=>({})}
},{timestamps:true});
schema.index({organizationId:1,modelDomain:1,entityId:1,observationAt:-1});
schema.index({organizationId:1,modelDomain:1,labelStatus:1,observationAt:1});
export type PredictiveObservationDocument=InferSchemaType<typeof schema>;
export const PredictiveObservation=model('PredictiveObservation',schema);
