import { Schema, model, type InferSchemaType } from 'mongoose';
const schema = new Schema({
  organizationId:{type:Schema.Types.ObjectId,ref:'Organization',index:true}, actorUserId:{type:Schema.Types.ObjectId,ref:'User',index:true},
  actorRole:{type:String,trim:true}, action:{type:String,required:true,index:true}, resourceType:{type:String,required:true,index:true}, resourceId:{type:Schema.Types.ObjectId,index:true},
  propertyId:{type:Schema.Types.ObjectId,ref:'Property',index:true}, buildingId:{type:Schema.Types.ObjectId,ref:'Building',index:true}, unitId:{type:Schema.Types.ObjectId,ref:'Unit',index:true},
  requestId:{type:String,index:true}, ipAddress:{type:String,trim:true}, userAgent:{type:String,trim:true,maxlength:1000},
  before:{type:Schema.Types.Mixed}, after:{type:Schema.Types.Mixed}, metadata:{type:Map,of:Schema.Types.Mixed,default:()=>({})}, occurredAt:{type:Date,required:true,index:true}
},{timestamps:true,versionKey:false});
schema.index({organizationId:1,occurredAt:-1}); schema.index({resourceType:1,resourceId:1,occurredAt:-1});
export type AuditLogDocument=InferSchemaType<typeof schema>; export const AuditLog=model('AuditLog',schema);
