import { Schema, model, type InferSchemaType } from 'mongoose';
const schema = new Schema({ organizationId:{type:Schema.Types.ObjectId,ref:'Organization',required:true,index:true}, userId:{type:Schema.Types.ObjectId,ref:'User',required:true,index:true},
  eventType:{type:String,required:true}, channels:{type:[String],enum:['IN_APP','EMAIL','SMS','PUSH','WHATSAPP'],default:['IN_APP']}, enabled:{type:Boolean,default:true} },{timestamps:true});
schema.index({organizationId:1,userId:1,eventType:1},{unique:true});
export type NotificationPreferenceDocument=InferSchemaType<typeof schema>; export const NotificationPreference=model('NotificationPreference',schema);
