import { describe, expect, it } from 'vitest';
import { autonomousEmailTemplateSchema, renderAutonomousEmail } from '../../src/modules/sales/sales-autonomous-email.policy.js';

const approved = { id: 'owner_intro', segment: 'Qualified', subject: 'For {{customer_name}}', body: 'Hello {{customer_name}}, here is the requested property operations briefing.' };

describe('Autonomous email template policy', () => {
  it('renders only the approved customer-name slot and removes header control characters', () => {
    const template = autonomousEmailTemplateSchema.parse(approved);
    expect(renderAutonomousEmail(template, 'Maya\r\nBCC: attacker@example.test')).toEqual({ subject: 'For Maya BCC: attacker@example.test', body: 'Hello Maya BCC: attacker@example.test, here is the requested property operations briefing.' });
  });
  it('rejects unsupported fields, interpolation and header breaks', () => {
    expect(autonomousEmailTemplateSchema.safeParse({ ...approved, body: 'Hello {{private_phone}}, here is the requested property operations briefing.' }).success).toBe(false);
    expect(autonomousEmailTemplateSchema.safeParse({ ...approved, subject: 'Hello\r\nBCC: other@example.test' }).success).toBe(false);
    expect(autonomousEmailTemplateSchema.safeParse({ ...approved, channel: 'SMS' }).success).toBe(false);
  });
});
