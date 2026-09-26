import { Schema, model, type InferSchemaType } from 'mongoose';
const schema = new Schema({
  organizationId:{type:Schema.Types.ObjectId,ref:'Organization',required:true,index:true},
  propertyId:{type:Schema.Types.ObjectId,ref:'Property',required:true,index:true},
  buildingId:{type:Schema.Types.ObjectId,ref:'Building',index:true},
  floorId:{type:Schema.Types.ObjectId,ref:'Floor',index:true},
  unitId:{type:Schema.Types.ObjectId,ref:'Unit',index:true},
  name:{type:String,required:true,trim:true,maxlength:160},
  cameraCode:{type:String,required:true,trim:true,maxlength:80},
  provider:{type:String,required:true,trim:true,maxlength:80},
  connectionType:{type:String,enum:['RTSP','ONVIF','HTTP','SDK','NVR','CLOUD'],required:true},
  status:{type:String,enum:['ONLINE','OFFLINE','DEGRADED','MAINTENANCE','DISABLED'],default:'OFFLINE',index:true},
  capabilities:{type:[String],default:[]},
  streamRef:{type:String,trim:true,maxlength:500},
  playbackRef:{type:String,trim:true,maxlength:500},
  lastSeenAt:Date,
  lastHeartbeatAt:Date,
  metadata:{type:Map,of:Schema.Types.Mixed,default:()=>({})},
  createdBy:{type:Schema.Types.ObjectId,ref:'User',required:true},
  updatedBy:{type:Schema.Types.ObjectId,ref:'User',required:true}
},{timestamps:true});
schema.index({organizationId:1,cameraCode:1},{unique:true});
schema.index({organizationId:1,propertyId:1,status:1});
export type SecurityCameraDocument=InferSchemaType<typeof schema>; export const SecurityCamera=model('SecurityCamera',schema);
