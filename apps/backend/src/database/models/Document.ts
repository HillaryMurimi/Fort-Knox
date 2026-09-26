import { Schema, model, type InferSchemaType } from 'mongoose';
const schema = new Schema({
  organizationId:{type:Schema.Types.ObjectId,ref:'Organization',required:true,index:true},
  propertyId:{type:Schema.Types.ObjectId,ref:'Property',index:true}, buildingId:{type:Schema.Types.ObjectId,ref:'Building',index:true},
  floorId:{type:Schema.Types.ObjectId,ref:'Floor',index:true}, unitId:{type:Schema.Types.ObjectId,ref:'Unit',index:true},
  ownerUserId:{type:Schema.Types.ObjectId,ref:'User',index:true},
  title:{type:String,required:true,trim:true,maxlength:240}, description:{type:String,trim:true,maxlength:5000},
  category:{type:String,enum:['LEASE','INSPECTION','MAINTENANCE','INVOICE','RECEIPT','IDENTITY','PROPERTY','TENANCY','MOVE_OUT','INSURANCE','LEGAL','FINANCIAL','OTHER'],required:true,index:true},
  fileName:{type:String,required:true,trim:true,maxlength:255}, mimeType:{type:String,required:true,trim:true,maxlength:160}, sizeBytes:{type:Number,required:true,min:0},
  storageProvider:{type:String,enum:['LOCAL','S3','CLOUDINARY','OTHER'],required:true,default:'S3'}, storageKey:{type:String,required:true,trim:true,maxlength:1000},
  sha256:{type:String,required:true,trim:true,lowercase:true,index:true}, version:{type:Number,required:true,min:1,default:1},
  visibility:{type:String,enum:['STAFF','TENANT','PRIVATE'],required:true,default:'STAFF'}, status:{type:String,enum:['ACTIVE','ARCHIVED','QUARANTINED'],required:true,default:'ACTIVE',index:true},
  tags:[{type:String,trim:true,maxlength:80}], metadata:{type:Map,of:Schema.Types.Mixed,default:()=>({})},
  createdBy:{type:Schema.Types.ObjectId,ref:'User',required:true}, updatedBy:{type:Schema.Types.ObjectId,ref:'User',required:true}
},{timestamps:true});
schema.index({organizationId:1,storageKey:1},{unique:true}); schema.index({organizationId:1,category:1,createdAt:-1}); schema.index({organizationId:1,propertyId:1,unitId:1,status:1});
export type DocumentDocument=InferSchemaType<typeof schema>; export const Document=model('Document',schema);
