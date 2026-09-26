import { Schema, model, type InferSchemaType } from 'mongoose';
const schema=new Schema({organizationId:{type:Schema.Types.ObjectId,ref:'Organization',required:true,index:true},periodStart:{type:Date,required:true},periodEnd:{type:Date,required:true},status:{type:String,enum:['OPEN','CLOSED','LOCKED'],default:'OPEN',index:true},closedAt:Date,closedBy:{type:Schema.Types.ObjectId,ref:'User'},notes:{type:String,trim:true,maxlength:5000},createdBy:{type:Schema.Types.ObjectId,ref:'User',required:true},updatedBy:{type:Schema.Types.ObjectId,ref:'User',required:true}},{timestamps:true});
schema.index({organizationId:1,periodStart:1,periodEnd:1},{unique:true});
export type FinancialPeriodDocument=InferSchemaType<typeof schema>; export const FinancialPeriod=model('FinancialPeriod',schema);
