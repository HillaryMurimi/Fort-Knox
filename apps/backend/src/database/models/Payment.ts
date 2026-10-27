import { Schema, model, type InferSchemaType } from 'mongoose';
const schema=new Schema({
 organizationId:{type:Schema.Types.ObjectId,ref:'Organization',required:true,index:true}, propertyId:{type:Schema.Types.ObjectId,ref:'Property',required:true,index:true}, buildingId:{type:Schema.Types.ObjectId,ref:'Building',required:true,index:true}, floorId:{type:Schema.Types.ObjectId,ref:'Floor',required:true,index:true}, unitId:{type:Schema.Types.ObjectId,ref:'Unit',required:true,index:true}, tenantId:{type:Schema.Types.ObjectId,ref:'Tenant',required:true,index:true}, tenancyId:{type:Schema.Types.ObjectId,ref:'Tenancy',required:true,index:true}, amount:{type:Number,required:true,min:0.01}, amountMinor:{type:Number,min:1,validate:Number.isSafeInteger}, currency:{type:String,required:true,uppercase:true,trim:true,default:'KES'}, method:{type:String,enum:['MPESA','BANK_TRANSFER','CARD','CASH','CHEQUE','OTHER'],required:true,index:true}, status:{type:String,enum:['PENDING','CONFIRMED','FAILED','REVERSED'],default:'PENDING',index:true}, confirmationSource:{type:String,enum:['PROVIDER','MANUAL_ACKNOWLEDGED']}, provider:{type:String,trim:true,maxlength:80}, providerTransactionId:{type:String,trim:true,maxlength:180}, receiptNumber:{type:String,trim:true,maxlength:180}, paidAt:Date, confirmedAt:Date, reversedAt:Date, notes:{type:String,trim:true,maxlength:5000}, metadata:{type:Map,of:Schema.Types.Mixed,default:()=>({})},createdBy:{type:Schema.Types.ObjectId,ref:'User',required:true},updatedBy:{type:Schema.Types.ObjectId,ref:'User',required:true}
 ,source:{type:String,enum:['TENANT_CLAIM','STAFF_ENTRY','PROVIDER_INITIATION']},
 claimIdempotencyKey:{type:String,trim:true,maxlength:80},
 claimTransactionReference:{type:String,trim:true,maxlength:120},
 claimReceivingAccount:{type:String,trim:true,maxlength:80},
 claimPaidAt:Date,
 claimEvidenceIds:[{type:Schema.Types.ObjectId,ref:'Evidence'}],
 verificationState:{type:String,enum:['PENDING_VERIFICATION','CLARIFICATION_REQUESTED','MANUALLY_CONFIRMED','PROVIDER_CONFIRMED','REJECTED','DISPUTED','REVERSED']},
 verificationBasis:{type:String,trim:true,maxlength:1000},
 verifiedReceivingAccount:{type:Boolean},
 reviewedBy:{type:Schema.Types.ObjectId,ref:'User'},
 reviewedAt:Date,
 reviewNote:{type:String,trim:true,maxlength:1000},
},{timestamps:true});
schema.index({organizationId:1,providerTransactionId:1},{unique:true,sparse:true}); schema.index({organizationId:1,tenantId:1,status:1,paidAt:-1});
schema.index({organizationId:1,claimIdempotencyKey:1},{unique:true,partialFilterExpression:{claimIdempotencyKey:{$type:'string'}}});
schema.index({organizationId:1,tenancyId:1,claimTransactionReference:1},{unique:true,partialFilterExpression:{source:'TENANT_CLAIM',claimTransactionReference:{$type:'string'}}});
schema.index({organizationId:1,verificationState:1,createdAt:-1});
export type PaymentDocument=InferSchemaType<typeof schema>; export const Payment=model('Payment',schema);
