const id = { name: 'organizationId', in: 'path', required: true, schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' } };
const supportId = { name: 'supportId', in: 'path', required: true, schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' } };
const responses = { '200': { description: 'Operation completed' }, '400': { description: 'Invalid input' }, '401': { description: 'Authentication required' }, '403': { description: 'Permission, consent or session scope denied' }, '409': { description: 'State conflict or expired grant' } };
const body = (properties: Record<string, unknown>, required: string[]) => ({ required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required, properties } } } });
const objectId = { type: 'string', pattern: '^[a-fA-F0-9]{24}$' };
const planKey = { enum: ['CONTROL', 'FORT_KNOX'] };
export const landlordOperationsPaths = {
  '/landlord-operations/overview': { get: { summary: 'Super admin landlord onboarding and pilot totals', responses } },
  '/landlord-operations/organizations': {
    get: { summary: 'Search paginated landlord organizations', parameters: [{ name: 'search', in: 'query', schema: { type: 'string' } }, { name: 'status', in: 'query', schema: { enum: ['ALL', 'PILOT', 'PAID', 'INCOMPLETE'] } }, { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } }], responses },
    post: { summary: 'Create organization and one-use verified-owner invitation (fresh admin step-up)', requestBody: body({ name: { type: 'string', minLength: 2 }, ownerEmail: { type: 'string', format: 'email' } }, ['name', 'ownerEmail']), responses },
  },
  '/landlord-operations/organizations/{organizationId}': { get: { summary: 'Organization onboarding, inventory, owner and support history', parameters: [id], responses } },
  '/landlord-operations/organizations/{organizationId}/support-sessions': { get: { summary: 'List scoped owner/admin support requests', parameters: [id], responses } },
  '/landlord-operations/support-sessions': { post: { summary: 'Request time-limited owner consent for property setup (fresh admin step-up)', requestBody: body({ organizationId: objectId, ownerUserId: objectId, purpose: { type: 'string', minLength: 10, maxLength: 500 }, permission: { const: 'PROPERTY_SETUP' } }, ['organizationId', 'ownerUserId', 'purpose', 'permission']), responses } },
  '/landlord-operations/support-sessions/{supportId}/approve': { post: { summary: 'Requested landlord approves support for one hour', parameters: [supportId], responses } },
  '/landlord-operations/support-sessions/{supportId}/reject': { post: { summary: 'Requested landlord rejects support', parameters: [supportId], responses } },
  '/landlord-operations/support-sessions/{supportId}/end': { post: { summary: 'Owner or requesting admin ends support immediately', parameters: [supportId], responses } },
  '/landlord-operations/support-sessions/{supportId}/units': { post: { summary: 'Create unit under an active, consented session; same unit body as POST /units', parameters: [supportId], responses } },
  '/landlord-operations/support-sessions/{supportId}/property-setups': { post: { summary: 'Create full property hierarchy under an active, consented session; same body as normal property setup', parameters: [supportId], responses } },
  '/landlord-operations/organizations/{organizationId}/pilot': { post: { summary: 'Grant unpaid, bounded evaluation to verified owner (fresh admin step-up)', parameters: [id], requestBody: body({ ownerUserId: objectId, planKey, durationDays: { type: 'integer', minimum: 1, maximum: 60 } }, ['ownerUserId', 'planKey', 'durationDays']), responses } },
  '/landlord-operations/organizations/{organizationId}/pilot/extend': { post: { summary: 'Extend active pilot, up to 60 days cumulative (fresh admin step-up)', parameters: [id], requestBody: body({ additionalDays: { type: 'integer', minimum: 1, maximum: 60 } }, ['additionalDays']), responses } },
  '/landlord-operations/organizations/{organizationId}/pilot/terminate': { post: { summary: 'End unpaid pilot immediately (fresh admin step-up)', parameters: [id], responses } },
  '/landlord-operations/organizations/{organizationId}/pilot/prepare-conversion': { post: { summary: 'Quote actual units and prepare owner-signed, Paystack-verified conversion; does not bill or sign', parameters: [id], requestBody: body({ planKey }, ['planKey']), responses } },
};
