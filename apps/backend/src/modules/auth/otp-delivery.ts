import { PRODUCT_NAME } from '../../config/brand.js';
import { env } from '../../config/env.js';
import { getEmailProvider, getSmsProvider } from '../../core/integrations/messaging-providers.js';
export type OtpChannel = 'EMAIL' | 'SMS';
let testDelivery: ((channel: OtpChannel, destination: string, code: string) => Promise<void>) | undefined;
export function setOtpTestDelivery(deliver?: typeof testDelivery) {
  if (env.NODE_ENV !== 'test') throw new Error('OTP capture is restricted to the test runtime');
  testDelivery = deliver;
}
const escape = (text: string) => text.replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char] ?? char));
export function otpMessage(code: string, seconds: number, purpose = 'sign-in') {
  const minutes = Math.ceil(seconds / 60);
  return { subject: PRODUCT_NAME + ' verification code',
    body: 'Your ' + PRODUCT_NAME + ' ' + purpose + ' code is ' + code + '. It expires in ' + minutes + ' minutes. Never share this code. If you did not request it, ignore this message.',
    html: '<div style="font-family:Arial,sans-serif;max-width:520px;margin:32px auto;color:#17202b"><h1>' + escape(PRODUCT_NAME) + '</h1><h2>Verify your ' + escape(purpose) + '</h2><p>Use this code to continue securely.</p><p style="font-size:32px;letter-spacing:8px;font-weight:bold;padding:20px;background:#eef2f6">' + escape(code) + '</p><p>Expires in ' + minutes + ' minutes. Never share this code.</p><p>If you did not request it, ignore this message and contact your platform administrator if requests continue.</p></div>' };
}
export async function deliverOtp(channel: OtpChannel, destination: string, code: string, seconds: number, purpose?: string, probe = false) {
  if (testDelivery) { await testDelivery(channel, destination, code); return { provider: 'TEST_MEMORY', providerMessageId: '', status: 'SENT' as const }; }
  const message = { to: destination, ...otpMessage(code, seconds, purpose) };
  const provider = channel === 'EMAIL' ? getEmailProvider() : getSmsProvider();
  return probe ? provider.sendProbe(message) : provider.send(message);
}
