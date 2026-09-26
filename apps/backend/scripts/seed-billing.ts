import 'dotenv/config';
import { connectDatabase } from '../src/config/database.js';
import { SubscriptionPlan } from '../src/database/models/SubscriptionPlan.js';

await connectDatabase();
const plans = [
  { key:'STARTER', name:'Starter', description:'For small property portfolios.', currency:'KES', amount:15000, billingInterval:'MONTH', trialDays:14, entitlements:{maxProperties:5,maxUnits:100,maxUsers:5,maxTenants:100,features:['command-center','finance','maintenance','documents','notifications']}, active:true },
  { key:'PROFESSIONAL', name:'Professional', description:'For growing property-management operations.', currency:'KES', amount:30000, billingInterval:'MONTH', trialDays:14, entitlements:{maxProperties:25,maxUnits:750,maxUsers:25,maxTenants:750,features:['command-center','finance','maintenance','documents','notifications','security','decision-intelligence','decision-automation']}, active:true },
  { key:'ENTERPRISE', name:'Enterprise', description:'For large portfolios and institutional operators.', currency:'KES', amount:75000, billingInterval:'MONTH', trialDays:30, entitlements:{maxProperties:-1,maxUnits:-1,maxUsers:-1,maxTenants:-1,features:['command-center','finance','maintenance','documents','notifications','security','decision-intelligence','decision-automation','predictive-intelligence','model-serving','advanced-reporting']}, active:true }
];
for (const plan of plans) await SubscriptionPlan.findOneAndUpdate({key:plan.key},plan,{upsert:true,new:true,setDefaultsOnInsert:true});
console.log('Billing plans seeded'); process.exit(0);
