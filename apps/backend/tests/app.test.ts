import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('API foundation', () => {
  it('returns service metadata', async () => {
    const response = await request(createApp()).get('/');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.name).toBe('Dapinni Property Command Center API');
  });

  it('returns liveness status without a database dependency', async () => {
    const response = await request(createApp()).get('/api/v1/health/live');
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('ok');
  });

  it('returns health status', async () => {
    const response = await request(createApp()).get('/api/v1/health');
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('ok');
  });

  it('protects operational diagnostics', async () => {
    const response = await request(createApp()).get('/api/v1/operations/diagnostics');
    expect(response.status).toBe(401);
  });
});
