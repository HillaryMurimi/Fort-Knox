import { Schema, model, type InferSchemaType } from 'mongoose';
const schema = new Schema({
  organizationId:{type:Schema.Types.ObjectId,ref:'Organization',required:true,index:true}, recipientUserId:{type:Schema.Types.ObjectId,ref:'User',required:true,index:true},
  channel:{type:String,enum:['IN_APP','EMAIL','SMS','PUSH','WHATSAPP'],required:true,index:true}, type:{type:String,required:true,index:true}, title:{type:String,required:true,trim:true,maxlength:240},
  body:{type:String,required:true,trim:true,maxlength:10000}, data:{type:Map,of:Schema.Types.Mixed,default:()=>({})},
  status:{type:String,enum:['QUEUED','SENT','DELIVERED','READ','FAILED','CANCELLED'],required:true,default:'QUEUED',index:true}, priority:{type:String,enum:['LOW','NORMAL','HIGH','URGENT'],default:'NORMAL'},
  scheduledFor:{type:Date,index:true}, sentAt:Date, readAt:Date, failureReason:{type:String,trim:true,maxlength:1000}, dedupeKey:{type:String,index:true},
  createdBy:{type:Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});
schema.index({recipientUserId:1,status:1,createdAt:-1}); schema.index({organizationId:1,scheduledFor:1,status:1}); schema.index({dedupeKey:1},{unique:true,sparse:true});
export type NotificationDocument=InferSchemaType<typeof schema>; export const Notification=model('Notification',schema);
