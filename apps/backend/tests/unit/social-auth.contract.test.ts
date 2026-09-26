import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { socialSignupSchema } from '../../src/modules/auth/social.schemas.js';
import { availableSocialProviders } from '../../src/integrations/auth/social-provider.js';
import { env } from '../../src/config/env.js';

describe('social owner sign-in boundary', () => {
  it('reports only configured providers and rejects unavailable starts', async () => {
    const app = createApp();
    const response = await request(app).get(`${env.API_PREFIX}/auth/social/providers`).expect(200);
    expect(response.body.data).toEqual(availableSocialProviders());
    const unavailable = (['google', 'facebook', 'apple'] as const).find((provider) => !availableSocialProviders()[provider]);
    if (unavailable) {
      const result = await request(app).post(`${env.API_PREFIX}/auth/social/${unavailable}/start`).set('Origin', env.WEB_ORIGIN).expect(503);
      expect(result.body.error.code).toBe('OAUTH_UNAVAILABLE');
    }
  });

  it('requires the configured web origin for a social start', async () => {
    const result = await request(createApp()).post(`${env.API_PREFIX}/auth/social/google/start`).set('Origin', 'https://untrusted.example').expect(403);
    expect(result.body.error.code).toBe('ORIGIN_DENIED');
  });

  it('rejects a forged or missing browser flow before phone verification', async () => {
    const response = await request(createApp()).post(`${env.API_PREFIX}/auth/social/challenge`).set('Origin', env.WEB_ORIGIN).send({}).expect(401);
    expect(response.body.error.code).toBe('SOCIAL_FLOW_EXPIRED');
  });

  it('rejects role, unit and malformed phone injection into owner setup', () => {
    const valid = { firstName: 'Amina', lastName: 'Owner', email: 'amina@example.com', phone: '+254700000000', organizationName: 'Amina Estates' };
    expect(socialSignupSchema.safeParse(valid).success).toBe(true);
    expect(socialSignupSchema.safeParse({ ...valid, role: 'SUPER_ADMIN' }).success).toBe(false);
    expect(socialSignupSchema.safeParse({ ...valid, unitId: '123' }).success).toBe(false);
    expect(socialSignupSchema.safeParse({ ...valid, phone: '0700000000' }).success).toBe(false);
  });
});
