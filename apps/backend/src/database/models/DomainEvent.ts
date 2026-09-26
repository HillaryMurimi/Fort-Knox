import { Schema, model, type InferSchemaType } from 'mongoose';
const schema = new Schema({
  organizationId:{type:Schema.Types.ObjectId,ref:'Organization',required:true,index:true}, eventId:{type:String,required:true,unique:true,index:true},
  name:{type:String,required:true,index:true}, aggregateType:{type:String,required:true,index:true}, aggregateId:{type:Schema.Types.ObjectId,required:true,index:true},
  actorUserId:{type:Schema.Types.ObjectId,ref:'User',index:true}, correlationId:{type:String,index:true}, causationId:{type:String,index:true}, version:{type:Number,required:true,min:1,default:1},
  payload:{type:Schema.Types.Mixed,required:true}, occurredAt:{type:Date,required:true,index:true}, publishedAt:{type:Date,index:true}
},{timestamps:true,versionKey:false});
schema.index({organizationId:1,name:1,occurredAt:-1}); schema.index({aggregateType:1,aggregateId:1,version:1},{unique:true});
export type DomainEventDocument=InferSchemaType<typeof schema>; export const DomainEvent=model('DomainEvent',schema);
