import { Schema, model, type InferSchemaType } from 'mongoose';
const schema = new Schema({
  organizationId:{type:Schema.Types.ObjectId,ref:'Organization',required:true,index:true}, propertyId:{type:Schema.Types.ObjectId,ref:'Property',index:true},
  buildingId:{type:Schema.Types.ObjectId,ref:'Building',index:true}, floorId:{type:Schema.Types.ObjectId,ref:'Floor',index:true}, unitId:{type:Schema.Types.ObjectId,ref:'Unit',index:true},
  ownerUserId:{type:Schema.Types.ObjectId,ref:'User',index:true}, documentId:{type:Schema.Types.ObjectId,ref:'Document'},
  evidenceType:{type:String,enum:['PHOTO','VIDEO','AUDIO','DOCUMENT','SCREENSHOT','METER_READING','SIGNATURE','OTHER'],required:true,index:true},
  source:{type:String,enum:['MOBILE','WEB','CCTV','SYSTEM','API','OTHER'],required:true}, capturedAt:{type:Date,required:true,index:true},
  title:{type:String,trim:true,maxlength:240}, description:{type:String,trim:true,maxlength:5000}, storageKey:{type:String,trim:true,maxlength:1000},
  sha256:{type:String,trim:true,lowercase:true,index:true}, mimeType:{type:String,trim:true,maxlength:160}, sizeBytes:{type:Number,min:0},
  relatedResourceType:{type:String,enum:['MAINTENANCE','INSPECTION','MOVE_OUT','TENANCY','EXPENSE','PAYMENT','ARREARS','PROPERTY','UNIT','SECURITY_EVENT','OTHER'],required:true,index:true},
  relatedResourceId:{type:Schema.Types.ObjectId,required:true,index:true}, metadata:{type:Map,of:Schema.Types.Mixed,default:()=>({})},
  createdBy:{type:Schema.Types.ObjectId,ref:'User',required:true}, createdAtClient:{type:Date}
},{timestamps:true});
schema.index({organizationId:1,relatedResourceType:1,relatedResourceId:1,capturedAt:-1}); schema.index({organizationId:1,sha256:1});
export type EvidenceDocument=InferSchemaType<typeof schema>; export const Evidence=model('Evidence',schema);
