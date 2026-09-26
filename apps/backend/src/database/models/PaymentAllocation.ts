import { Schema, model, type InferSchemaType } from 'mongoose';
const schema=new Schema({organizationId:{type:Schema.Types.ObjectId,ref:'Organization',required:true,index:true},paymentId:{type:Schema.Types.ObjectId,ref:'Payment',required:true,index:true},rentChargeId:{type:Schema.Types.ObjectId,ref:'RentCharge',required:true,index:true},amount:{type:Number,required:true,min:0.01},allocatedAt:{type:Date,required:true,default:Date.now},allocatedBy:{type:Schema.Types.ObjectId,ref:'User',required:true}},{timestamps:true});
schema.index({paymentId:1,rentChargeId:1},{unique:true}); schema.index({organizationId:1,rentChargeId:1});
export type PaymentAllocationDocument=InferSchemaType<typeof schema>; export const PaymentAllocation=model('PaymentAllocation',schema);
