import type { RequestHandler } from 'express';
import { z } from 'zod';
import { sendSuccess } from '../../core/response/apiResponse.js';
import { authEvidence } from './admin-security.js';
import { OtpSettingsService } from './otp-settings.service.js';
export const list: RequestHandler = async (req, res) => { sendSuccess(res, await OtpSettingsService.list(authEvidence(req.auth))); };
export const startTest: RequestHandler = async (req, res) => {
  const { channel } = z.object({ channel: z.enum(['EMAIL', 'SMS']) }).strict().parse(req.body);
  sendSuccess(res, await OtpSettingsService.startTest(authEvidence(req.auth), channel));
};
export const verifyTest: RequestHandler = async (req, res) => {
  const input = z.object({ testToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/), code: z.string().regex(/^\d{6}$/) }).strict().parse(req.body);
  sendSuccess(res, await OtpSettingsService.verifyTest(authEvidence(req.auth), input.testToken, input.code));
};
