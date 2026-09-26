import { Schema, model, type InferSchemaType } from 'mongoose';
const schema=new Schema({
 organizationId:{type:Schema.Types.ObjectId,ref:'Organization',required:true,index:true}, domain:{type:String,enum:['ARREARS','VACANCY','REVENUE'],required:true,index:true},
 modelId:{type:Schema.Types.ObjectId,ref:'PredictiveModel',required:true,index:true}, modelVersion:{type:String,required:true,index:true}, modelSource:{type:String,enum:['RULE','ML_CHAMPION','ML_CHALLENGER'],required:true,index:true},
 entityType:{type:String,enum:['TENANT','UNIT','PROPERTY'],required:true}, entityId:{type:Schema.Types.ObjectId,required:true,index:true}, value:{type:Number,required:true}, confidence:{type:Number,min:0,max:1,required:true}, features:{type:Map,of:Number,default:()=>({})},
 predictionAt:{type:Date,required:true,index:true}, influencedAction:{type:Boolean,default:false,index:true}, actionId:{type:Schema.Types.ObjectId,ref:'LandlordAction'}, outcome:{type:Number}, outcomeObservedAt:Date, metadata:{type:Map,of:Schema.Types.Mixed,default:()=>({})}
},{timestamps:true});
schema.index({organizationId:1,domain:1,modelVersion:1,predictionAt:-1}); schema.index({organizationId:1,domain:1,entityId:1,predictionAt:-1});
export type ModelPredictionDocument=InferSchemaType<typeof schema>; export const ModelPrediction=model('ModelPrediction',schema);
