import 'dotenv/config';
import { connectDatabase } from '../src/config/database.js';
import { SubscriptionPlan } from '../src/database/models/SubscriptionPlan.js';

await connectDatabase();
const plans = [
  { key:'CONTROL', name:'Control', description:'Core property operations, finance, maintenance, documents and notifications.', currency:'KES', amount:10000, billingInterval:'MONTH', trialDays:14, entitlements:{maxProperties:-1,maxUnits:-1,maxUsers:-1,maxTenants:-1,features:['command-center','finance','maintenance','documents','notifications']}, metadata:{includedUnits:50,additionalUnitAmount:200,pricingModel:'BASE_PLUS_ACTIVE_UNITS'}, active:true },
  { key:'FORT_KNOX', name:'Fort Knox', description:'Control plus security, CCTV, evidence, advanced intelligence and remote oversight.', currency:'KES', amount:30000, billingInterval:'MONTH', trialDays:14, entitlements:{maxProperties:-1,maxUnits:-1,maxUsers:-1,maxTenants:-1,features:['command-center','finance','maintenance','documents','notifications','security','cctv','evidence','decision-intelligence','decision-automation','predictive-intelligence','model-serving','advanced-reporting']}, metadata:{includedUnits:50,additionalUnitAmount:200,pricingModel:'BASE_PLUS_ACTIVE_UNITS',hardwareIncluded:false}, active:true }
];
await SubscriptionPlan.updateMany({ key: { $nin: ['CONTROL', 'FORT_KNOX'] } }, { $set: { active: false } });
for (const plan of plans) await SubscriptionPlan.findOneAndUpdate({key:plan.key},plan,{upsert:true,new:true,setDefaultsOnInsert:true});
console.log('Control and Fort Knox billing plans seeded'); process.exit(0);
