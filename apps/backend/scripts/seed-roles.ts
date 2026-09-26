import 'dotenv/config';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { Role } from '../src/database/models/Role.js';

const roles = [
  { key: 'SUPER_ADMIN', name: 'Super Admin', system: true, permissions: ['*'] },
  { key: 'LANDLORD', name: 'Landlord / Owner', system: true, permissions: ['portfolio.view', 'finance.view', 'finance.manage', 'maintenance.view', 'maintenance.approve', 'cctv.view', 'cctv.playback', 'cctv.download', 'audit.view', 'staff.manage', 'reports.view'] },
  { key: 'PROPERTY_MANAGER', name: 'Property Manager', system: true, permissions: ['portfolio.view', 'property.view', 'unit.view', 'tenant.view', 'tenant.update', 'rent.view', 'maintenance.view', 'maintenance.create', 'maintenance.assign', 'maintenance.approve', 'reports.view'] },
  { key: 'CARETAKER', name: 'Caretaker', system: true, permissions: ['property.view', 'unit.view', 'tenant.view', 'maintenance.view', 'maintenance.create', 'maintenance.assign', 'contractor.view', 'cctv.view'] },
  { key: 'CONTRACTOR', name: 'Contractor', system: true, permissions: ['maintenance.view', 'maintenance.update', 'maintenance.media.upload', 'invoice.create'] },
  { key: 'TENANT', name: 'Tenant', system: true, permissions: ['own.tenancy.view', 'own.rent.view', 'own.payment.view', 'own.maintenance.create', 'own.maintenance.view', 'own.documents.view', 'own.announcements.view', 'own.emergency.create'] }
];

await connectDatabase();
for (const role of roles) await Role.findOneAndUpdate({ key: role.key }, role, { upsert: true, new: true, setDefaultsOnInsert: true });
await disconnectDatabase();
console.log(`Seeded ${roles.length} system roles.`);
