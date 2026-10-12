import type { Request, RequestHandler } from 'express';
import { z } from 'zod';
import { sendSuccess } from '../../core/response/apiResponse.js';
import { availableChannels } from './otp-policy.js';
import { resendAccountOtp, verifyAccountOtp } from './account-otp.service.js';
import { setRefreshCookie } from './auth.controller.js';
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const meta = (req: Request) => ({ userAgent: req.get('user-agent'), ipAddress: req.ip, requestId: req.requestId });
export const availability: RequestHandler = async (_req, res) => { sendSuccess(res, { channels: await availableChannels(), defaultChannel: 'EMAIL' }); };
export const resend: RequestHandler = async (req, res) => {
  const input = z.object({ challengeToken: token, channel: z.enum(['EMAIL', 'SMS']).optional() }).strict().parse(req.body);
  sendSuccess(res, await resendAccountOtp(input.challengeToken, input.channel, meta(req)));
};
export const verify: RequestHandler = async (req, res) => {
  const input = z.object({ challengeToken: token, channel: z.enum(['EMAIL', 'SMS']), code: z.string().regex(/^\d{6}$/) }).strict().parse(req.body);
  const result = await verifyAccountOtp(input.challengeToken, input.channel, input.code, meta(req));
  setRefreshCookie(res, result.refreshToken);
  const { refreshToken: _secret, ...safe } = result;
  sendSuccess(res, safe);
};
