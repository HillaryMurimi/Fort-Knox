import { Schema, model, type InferSchemaType } from 'mongoose';
const schema=new Schema({
 organizationId:{type:Schema.Types.ObjectId,ref:'Organization',required:true,index:true}, propertyId:{type:Schema.Types.ObjectId,ref:'Property',required:true,index:true}, buildingId:{type:Schema.Types.ObjectId,ref:'Building',required:true}, floorId:{type:Schema.Types.ObjectId,ref:'Floor',required:true}, unitId:{type:Schema.Types.ObjectId,ref:'Unit',required:true,index:true}, asOf:{type:Date,required:true,index:true}, currentVacancyDays:{type:Number,min:0,required:true}, historicalMedianDays:{type:Number,min:0,required:true}, historicalSampleSize:{type:Number,min:0,required:true}, predictedDaysToLease:{type:Number,min:0,required:true}, predictedLeaseDate:{type:Date}, monthlyRent:{type:Number,min:0,required:true}, revenueAtRisk:{type:Number,min:0,required:true}, confidence:{type:Number,min:0,max:1,required:true}, modelVersion:{type:String,required:true}, drivers:[{code:String,label:String,impact:Number}], createdBy:{type:Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});
schema.index({organizationId:1,propertyId:1,unitId:1,asOf:-1});
export type VacancyForecastDocument=InferSchemaType<typeof schema>;
export const VacancyForecast=model('VacancyForecast',schema);
