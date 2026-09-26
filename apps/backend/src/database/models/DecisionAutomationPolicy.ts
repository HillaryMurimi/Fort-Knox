import { Schema, model, type InferSchemaType } from 'mongoose';
const schema=new Schema({
 organizationId:{type:Schema.Types.ObjectId,ref:'Organization',required:true,unique:true,index:true}, enabled:{type:Boolean,default:true}, evaluationIntervalMinutes:{type:Number,min:5,max:10080,default:60}, escalationAfterMinutes:{type:Number,min:15,max:43200,default:120}, notifyPriority:{type:String,enum:['CRITICAL','HIGH','MEDIUM','LOW'],default:'HIGH'}, forecastHorizonDays:{type:Number,min:7,max:365,default:30}, maxNotificationsPerRun:{type:Number,min:1,max:100,default:20}, lastEvaluatedAt:Date,lastScheduledAt:Date,updatedBy:{type:Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});
export type DecisionAutomationPolicyDocument=InferSchemaType<typeof schema>;
export const DecisionAutomationPolicy=model('DecisionAutomationPolicy',schema);
