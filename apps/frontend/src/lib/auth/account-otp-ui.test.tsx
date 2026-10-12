import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AccountOtpPanel } from '@/components/auth/account-otp-panel';
import type { AccountOtpResponse } from '@/types/auth';
const challenge: AccountOtpResponse = { accountOtpRequired: true, challengeToken: 'private-ui-token', challenge: { channel: 'EMAIL', destination: 't***@example.test', delivery: 'SENT', expiresAt: new Date(Date.now() + 300000).toISOString(), resendAt: new Date(Date.now() + 60000).toISOString() } };
function view(changes: Partial<Parameters<typeof AccountOtpPanel>[0]> = {}) {
  return renderToStaticMarkup(<AccountOtpPanel challenge={challenge} channels={['EMAIL']} code="" seconds={60} error={null} busy={false} onCode={() => {}} onVerify={() => {}} onResend={() => {}} onRestart={() => {}} {...changes} />);
}
describe('account email/SMS verification UI', () => {
  it('shows the channel and masked destination', () => { const html = view(); expect(html).toContain('Verify your email'); expect(html).toContain('t***@example.test'); expect(html).not.toContain(challenge.challengeToken); });
  it('does not advertise SMS when it is unavailable', () => { expect(view()).not.toContain('Switch to SMS'); });
  it('allows channel switching only when enabled and after the countdown', () => { const html = view({ channels: ['EMAIL', 'SMS'], seconds: 0 }); expect(html).toContain('Switch to SMS'); });
  it('shows resend countdown', () => { expect(view()).toContain('Resend available in 60 seconds'); });
  it('provides an accessible verification field', () => { const html = view(); expect(html).toContain('Verification code'); expect(html).toContain('autoComplete="one-time-code"'); expect(html).toContain('inputMode="numeric"'); });
  it('shows backend failures as an alert', () => { const html = view({ error: 'Temporarily locked' }); expect(html).toContain('role="alert"'); expect(html).toContain('Temporarily locked'); });
  it('shows delivery failure without accepting a code', () => { const html = view({ challenge: { ...challenge, challenge: { ...challenge.challenge, delivery: 'FAILED' } } }); expect(html).toContain('Delivery failed'); expect(html).toContain('disabled'); });
  it('shows processing state with disabled controls', () => { const html = view({ busy: true }); expect(html).toContain('aria-busy="true"'); expect(html).toContain('Processing verification'); });
  it('shows expiry and a resend path', () => { const html = view({ expired: true, challenge: { ...challenge, challenge: { ...challenge.challenge, expiresAt: new Date(0).toISOString() } } }); expect(html).toContain('This code expired'); expect(html).toContain('Resend code'); });
  it('never marks an entered contact as verified before success', () => { expect(view()).toContain('Contact details become verified only after the code succeeds'); });
});
