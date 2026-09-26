import { Schema, model, type InferSchemaType } from 'mongoose';
const schema = new Schema({
  organizationId:{type:Schema.Types.ObjectId,ref:'Organization',required:true,index:true}, propertyId:{type:Schema.Types.ObjectId,ref:'Property',required:true,index:true}, buildingId:{type:Schema.Types.ObjectId,ref:'Building',index:true}, floorId:{type:Schema.Types.ObjectId,ref:'Floor',index:true}, unitId:{type:Schema.Types.ObjectId,ref:'Unit',index:true},
  incidentNumber:{type:String,required:true,trim:true,maxlength:80}, title:{type:String,required:true,trim:true,maxlength:240}, description:{type:String,trim:true,maxlength:10000},
  category:{type:String,enum:['SECURITY','THEFT','TRESPASS','VANDALISM','FIRE','SAFETY','ASSAULT','ACCESS_CONTROL','OTHER'],required:true,index:true}, severity:{type:String,enum:['LOW','MEDIUM','HIGH','CRITICAL'],required:true,index:true},
  status:{type:String,enum:['OPEN','INVESTIGATING','CONTAINED','RESOLVED','CLOSED','FALSE_ALARM'],default:'OPEN',index:true},
  reportedAt:{type:Date,required:true,index:true}, containedAt:Date,resolvedAt:Date,closedAt:Date,
  sourceEventIds:[{type:Schema.Types.ObjectId,ref:'SecurityEvent'}], evidenceIds:[{type:Schema.Types.ObjectId,ref:'Evidence'}], documentIds:[{type:Schema.Types.ObjectId,ref:'Document'}],
  assignedToUserId:{type:Schema.Types.ObjectId,ref:'User'}, resolutionNotes:{type:String,trim:true,maxlength:10000}, metadata:{type:Map,of:Schema.Types.Mixed,default:()=>({})},
  createdBy:{type:Schema.Types.ObjectId,ref:'User',required:true},updatedBy:{type:Schema.Types.ObjectId,ref:'User',required:true}
},{timestamps:true});
schema.index({organizationId:1,incidentNumber:1},{unique:true}); schema.index({organizationId:1,status:1,severity:1,reportedAt:-1});
export type IncidentDocument=InferSchemaType<typeof schema>; export const Incident=model('Incident',schema);
