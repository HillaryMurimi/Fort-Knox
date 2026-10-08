import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdminMfaChoicePanel } from '@/components/auth/admin-mfa-choice';
import { AdminMfaPanel } from '@/components/auth/admin-mfa-panel';
import type { AdminMfaChallenge, AdminMfaChoice } from '@/types/auth';
const challenge: AdminMfaChallenge = { mfaRequired: true, flowToken: 'opaque-test-fixture', stage: 'EMAIL', requiredChannels: 'BOTH',
  challenge: { channel: 'EMAIL', destination: 'a***@example.test', expiresAt: '2026-10-02T12:00:00Z', resendAt: '2026-10-02T11:58:00Z', delivery: 'SENT' } };
const render = (extra: Partial<Parameters<typeof AdminMfaPanel>[0]> = {}) => renderToStaticMarkup(createElement(AdminMfaPanel, {
  challenge, code: '', error: null, busy: null, seconds: 60, onCode() {}, onVerify() {}, onResend() {}, onRestart() {}, ...extra
}));
describe('administrator MFA presentation', () => {
  it('labels the email stage and shows only a masked destination', () => { const html = render(); expect(html).toContain('Verify your email'); expect(html).toContain('a***@example.test'); expect(html).not.toContain('opaque-test-fixture'); expect(html).toContain('aria-current="step"'); });
  it('labels SMS after successful email verification', () => { const html = render({ challenge: { ...challenge, stage: 'SMS', challenge: { ...challenge.challenge, channel: 'SMS', destination: '+254 *** *** **' } } }); expect(html).toContain('Verify your phone'); expect(html).toContain('Your password and email are verified'); });
  it('shows the resend countdown', () => { expect(render()).toContain('Resend code in 60s'); });
  it('enables resend when the countdown expires', () => { expect(render({ seconds: 0 })).toContain('Resend code</button>'); });
  it('shows invalid or expired verification errors accessibly', () => { const html = render({ error: 'The verification code expired.' }); expect(html).toContain('role="alert"'); expect(html).toContain('code expired'); });
  it.each(['VERIFY', 'RESEND'] as const)('disables competing operations while %s runs', busy => { const html = render({ busy }); expect(html).toContain('disabled'); expect(html).toContain('aria-busy="true"'); });
  it('provides retry and secure recovery instructions for delivery failure', () => { const html = render({ challenge: { ...challenge, challenge: { ...challenge.challenge, delivery: 'FAILED' } } }); expect(html).toContain('Code delivery failed'); expect(html).toContain('Administrator access remains locked'); expect(html).toContain('audited recovery'); });
  it('supports numeric keyboard input and password-manager OTP completion', () => { const html = render(); expect(html).toContain('inputMode="numeric"'); expect(html).toContain('autoComplete="one-time-code"'); expect(html).toContain('Email verification code'); });
  it('explains temporary lockout without offering a bypass', () => { const html = render({ error: 'Too many authentication failures. Try again after the temporary lockout.' }); expect(html).toContain('temporary lockout'); expect(html).not.toContain('Skip'); });
});

describe('administrator login channel choice', () => {
  const choice: AdminMfaChoice = { mfaRequired: true, flowToken: 'opaque-test-fixture', stage: 'CHANNEL', channels: [
    { channel: 'EMAIL', destination: 'a***@example.test' }, { channel: 'SMS', destination: '+254 *** *** **' }
  ] };
  const choiceMarkup = (sending: 'EMAIL' | 'SMS' | null = null, error: string | null = null) =>
    renderToStaticMarkup(createElement(AdminMfaChoicePanel, { choice, sending, error, onChoose() {}, onRestart() {} }));
  it('offers both masked methods after password without rendering a code input', () => {
    const html = choiceMarkup();
    expect(html).toContain('Send email code'); expect(html).toContain('Send SMS code');
    expect(html).toContain('a***@example.test'); expect(html).toContain('+254 *** *** **');
    expect(html).not.toContain('opaque-test-fixture'); expect(html).not.toContain('one-time-code');
    expect(html).toContain('aria-labelledby="admin-channel-title"'); expect(html).toContain('type="button"');
  });
  it.each(['EMAIL', 'SMS'] as const)('announces %s delivery and disables competing choices', channel => {
    const html = choiceMarkup(channel); expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"'); expect(html).toContain('disabled');
  });
  it('shows selection failure with a safe restart path', () => {
    const html = choiceMarkup(null, 'Authentication expired. Sign in again.');
    expect(html).toContain('role="alert"'); expect(html).toContain('Authentication expired');
    expect(html).toContain('Start sign-in again');
  });
  it.each(['EMAIL', 'SMS'] as const)('shows one %s OTP and truthful password-only evidence', channel => {
    const html = render({ challenge: { ...challenge, stage: channel, requiredChannels: 'ONE', challenge: { ...challenge.challenge, channel } } });
    expect(html).toContain(channel === 'EMAIL' ? 'Verify email and sign in' : 'Verify phone and sign in');
    expect(html).toContain('Verify your chosen channel to sign in');
    expect(html).not.toContain('Your password and email are verified');
    expect(html).toContain('Verification method chosen');
  });
});
