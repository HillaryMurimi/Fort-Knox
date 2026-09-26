import { Schema, model, type InferSchemaType } from 'mongoose';
const schema=new Schema({
 organizationId:{type:Schema.Types.ObjectId,ref:'Organization',required:true,index:true}, propertyId:{type:Schema.Types.ObjectId,ref:'Property',required:true,index:true}, asOf:{type:Date,required:true,index:true}, horizonDays:{type:Number,min:1,required:true}, baselineMonthlyRevenue:{type:Number,min:0,required:true}, expectedRevenue:{type:Number,min:0,required:true}, revenueAtRisk:{type:Number,min:0,required:true}, vacancyRiskAmount:{type:Number,min:0,required:true}, arrearsRiskAmount:{type:Number,min:0,required:true}, collectionRiskAmount:{type:Number,min:0,required:true}, maintenanceRiskAmount:{type:Number,min:0,required:true}, healthVelocity:{type:Number,default:0}, confidence:{type:Number,min:0,max:1,required:true}, modelVersion:{type:String,required:true}, drivers:[{code:String,label:String,impact:Number}], createdBy:{type:Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});
schema.index({organizationId:1,propertyId:1,asOf:-1});
export type RevenueRiskForecastDocument=InferSchemaType<typeof schema>;
export const RevenueRiskForecast=model('RevenueRiskForecast',schema);
