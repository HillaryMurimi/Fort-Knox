import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdminMfaPanel } from '@/components/auth/admin-mfa-panel';
import type { AdminMfaResponse } from '@/types/auth';
const challenge: AdminMfaResponse = { mfaRequired: true, flowToken: 'opaque-test-fixture', stage: 'EMAIL',
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
