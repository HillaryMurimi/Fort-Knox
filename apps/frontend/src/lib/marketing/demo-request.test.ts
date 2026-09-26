import { describe, expect, it } from 'vitest';
import { demoRequestService } from './demo-request';

describe('demo request integration boundary', () => {
  it('prepares a valid request without pretending it was delivered', async () => {
    const result = await demoRequestService.submit({
      name: 'Amina Owner', phone: '+254700000000', email: 'AMINA@example.com',
      properties: '3', units: '51-100', challenge: 'Maintenance approvals are fragmented.',
    });
    expect(result.status).toBe('prepared');
    expect(result.reference).toMatch(/^DEMO-/);
  });

  it('rejects an incomplete lead', async () => {
    await expect(demoRequestService.submit({
      name: '', phone: '', email: '', properties: '1', units: '1-20', challenge: '',
    })).rejects.toThrow('Complete the required contact and portfolio fields.');
  });
});
