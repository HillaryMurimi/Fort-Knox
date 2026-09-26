import { describe, expect, it } from 'vitest';
import { createDocumentSchema } from '../../src/modules/documents/document.schemas.js'; import { createEvidenceSchema } from '../../src/modules/evidence/evidence.schemas.js'; import { PERMISSIONS } from '../../src/modules/permissions/permission.catalog.js';
const oid='507f1f77bcf86cd799439011';
describe('documents/evidence/audit contracts',()=>{
 it('rejects malformed document ids and hashes',()=>{expect(()=>createDocumentSchema.parse({title:'Lease',category:'LEASE',fileName:'lease.pdf',mimeType:'application/pdf',sizeBytes:10,storageKey:'x',sha256:'bad'})).toThrow();});
 it('requires evidence linkage',()=>{expect(()=>createEvidenceSchema.parse({evidenceType:'PHOTO',source:'MOBILE',capturedAt:new Date(),relatedResourceType:'MAINTENANCE'})).toThrow();expect(createEvidenceSchema.parse({evidenceType:'PHOTO',source:'MOBILE',capturedAt:new Date(),relatedResourceType:'MAINTENANCE',relatedResourceId:oid})).toBeTruthy();});
 it('keeps permission catalog unique',()=>{expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);expect(PERMISSIONS).toContain('evidence.manage');expect(PERMISSIONS).toContain('job.manage');});
});
