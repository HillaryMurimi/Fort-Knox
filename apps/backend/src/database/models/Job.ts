import { Schema, model, type InferSchemaType } from 'mongoose';
const schema = new Schema({
  organizationId:{type:Schema.Types.ObjectId,ref:'Organization',index:true}, type:{type:String,required:true,index:true}, payload:{type:Schema.Types.Mixed,required:true},
  status:{type:String,enum:['QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED','DEAD_LETTER'],required:true,default:'QUEUED',index:true}, priority:{type:Number,default:0,index:true}, attempts:{type:Number,default:0}, maxAttempts:{type:Number,default:5,min:1},
  availableAt:{type:Date,required:true,index:true}, lockedAt:Date, lockedBy:{type:String}, startedAt:Date, completedAt:Date, failedAt:Date, lastError:{type:String,trim:true,maxlength:5000}, result:{type:Schema.Types.Mixed}, dedupeKey:{type:String,index:true},
  createdBy:{type:Schema.Types.ObjectId,ref:'User'},
  deadLetteredAt:Date,
  leaseExpiresAt:Date
},{timestamps:true});
schema.index({status:1,availableAt:1,priority:-1});
schema.index({status:1,leaseExpiresAt:1}); schema.index({dedupeKey:1},{unique:true,sparse:true});
export type JobDocument=InferSchemaType<typeof schema>; export const Job=model('Job',schema);
