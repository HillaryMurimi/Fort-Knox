import { Schema, model, type InferSchemaType } from 'mongoose';
const schema = new Schema({
  organizationId:{type:Schema.Types.ObjectId,ref:'Organization',required:true,index:true},
  propertyId:{type:Schema.Types.ObjectId,ref:'Property',required:true,index:true},
  buildingId:{type:Schema.Types.ObjectId,ref:'Building',index:true}, floorId:{type:Schema.Types.ObjectId,ref:'Floor',index:true}, unitId:{type:Schema.Types.ObjectId,ref:'Unit',index:true},
  cameraId:{type:Schema.Types.ObjectId,ref:'SecurityCamera',index:true},
  type:{type:String,enum:['MOTION','PERSON_DETECTED','VEHICLE_DETECTED','INTRUSION','TAMPER','CAMERA_OFFLINE','CAMERA_ONLINE','AUDIO','FIRE','SMOKE','PANIC','ACCESS_DENIED','SYSTEM'],required:true,index:true},
  severity:{type:String,enum:['INFO','LOW','MEDIUM','HIGH','CRITICAL'],required:true,index:true},
  status:{type:String,enum:['OPEN','ACKNOWLEDGED','ESCALATED','RESOLVED','DISMISSED'],default:'OPEN',index:true},
  detectedAt:{type:Date,required:true,index:true}, acknowledgedAt:Date,resolvedAt:Date,
  source:{type:String,enum:['CCTV','ACCESS_CONTROL','SENSOR','USER','SYSTEM','INTEGRATION'],required:true},
  confidence:{type:Number,min:0,max:1},
  snapshotEvidenceIds:[{type:Schema.Types.ObjectId,ref:'Evidence'}],
  description:{type:String,trim:true,maxlength:5000}, metadata:{type:Map,of:Schema.Types.Mixed,default:()=>({})},
  acknowledgedBy:{type:Schema.Types.ObjectId,ref:'User'}, resolvedBy:{type:Schema.Types.ObjectId,ref:'User'},
  createdBy:{type:Schema.Types.ObjectId,ref:'User'}, updatedBy:{type:Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});
schema.index({organizationId:1,detectedAt:-1}); schema.index({organizationId:1,propertyId:1,severity:1,status:1}); schema.index({organizationId:1,cameraId:1,detectedAt:-1});
export type SecurityEventDocument=InferSchemaType<typeof schema>; export const SecurityEvent=model('SecurityEvent',schema);
