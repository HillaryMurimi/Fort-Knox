import 'dotenv/config'; 
import { connectDatabase } from '../src/config/database.js'; 
import { Permission } from '../src/database/models/Permission.js'; 
import { Role } from '../src/database/models/Role.js'; 
import { PERMISSION_META } from '../src/modules/permissions/permission.catalog.js'; 
import { SYSTEM_ROLES } from '../src/modules/roles/role.catalog.js';

await connectDatabase(); 
await Permission.bulkWrite(PERMISSION_META.map(p=>({updateOne:{filter:{key:p.key},update:{$set:p},upsert:true}}))); 

for(const [key,data] of Object.entries(SYSTEM_ROLES)){await Role.findOneAndUpdate({key,organizationId:null},{...data,key,system:true,organizationId:null},{upsert:true,new:true,setDefaultsOnInsert:true});} console.log('RBAC catalog seeded'); process.exit(0);
