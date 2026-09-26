import type { RequestHandler, Response } from 'express';
import { acceptInvitationSchema, bootstrapLandlordSchema, loginSchema, requestOtpSchema, verifyOtpSchema, verifyStepUpSchema } from './auth.schemas.js';
import { bootstrapLandlord, loginByEmail, loginByPhone, refreshSession, requestOtp, revokeRefreshSession, verifyLoginOtp, verifyStepUp } from './auth.service.js';
import { sendSuccess } from '../../core/response/apiResponse.js';
import { AppError } from '../../core/errors/AppError.js';
import { InvitationService } from '../invitations/invitation.service.js';
import { env } from '../../config/env.js';

const cookieOptions = { httpOnly: true, secure: env.REFRESH_COOKIE_SECURE, sameSite: 'lax' as const, path: `${env.API_PREFIX}/auth`, maxAge: 30 * 24 * 60 * 60 * 1000 };
export const setRefreshCookie = (res: Response, token: string) => res.cookie(env.REFRESH_COOKIE_NAME, token, cookieOptions);
const clearRefreshCookie = (res: Response) => res.clearCookie(env.REFRESH_COOKIE_NAME, { httpOnly: true, secure: env.REFRESH_COOKIE_SECURE, sameSite: 'lax' as const, path: `${env.API_PREFIX}/auth` });

export const login: RequestHandler = async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid login payload', parsed.error.flatten());
  if (parsed.data.method === 'email') return sendSuccess(res, await loginByEmail(parsed.data.email, parsed.data.password));
  return sendSuccess(res, await loginByPhone(parsed.data.phone));
};

export const requestLoginOtp: RequestHandler = async (req, res) => {
  const parsed = requestOtpSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid phone number', parsed.error.flatten());
  sendSuccess(res, await requestOtp(parsed.data.phone, 'LOGIN'));
};

export const verifyLogin: RequestHandler = async (req, res) => {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid OTP payload', parsed.error.flatten());
  const result = await verifyLoginOtp(parsed.data.phone, parsed.data.code, { userAgent: req.get('user-agent'), ipAddress: req.ip });
  setRefreshCookie(res, result.refreshToken);
  const { refreshToken: _refreshToken, ...safe } = result;
  sendSuccess(res, safe);
};

export const verifyStepUpOtp: RequestHandler = async (req, res) => {
  const parsed = verifyStepUpSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid step-up payload', parsed.error.flatten());
  const result = await verifyStepUp(parsed.data.email, parsed.data.code, { userAgent: req.get('user-agent'), ipAddress: req.ip });
  setRefreshCookie(res, result.refreshToken);
  const { refreshToken: _refreshToken, ...safe } = result;
  sendSuccess(res, safe);
};

export const refresh: RequestHandler = async (req, res) => {
  const token = req.cookies?.[env.REFRESH_COOKIE_NAME];
  if (typeof token !== 'string') throw new AppError(401, 'REFRESH_TOKEN_MISSING', 'Refresh session is required');
  const result = await refreshSession(token, { userAgent: req.get('user-agent'), ipAddress: req.ip });
  setRefreshCookie(res, result.refreshToken);
  const { refreshToken: _refreshToken, ...safe } = result;
  sendSuccess(res, safe);
};

export const logout: RequestHandler = async (req, res) => {
  const token = req.cookies?.[env.REFRESH_COOKIE_NAME];
  if (typeof token === 'string') await revokeRefreshSession(token);
  clearRefreshCookie(res);
  sendSuccess(res, { loggedOut: true });
};

export const bootstrap: RequestHandler = async (req, res) => {
  const parsed = bootstrapLandlordSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid landlord signup payload', parsed.error.flatten());
  sendSuccess(res, await bootstrapLandlord(parsed.data), 201);
};

export const acceptInvitation: RequestHandler = async (req, res) => {
  const parsed = acceptInvitationSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid invitation acceptance payload', parsed.error.flatten());
  sendSuccess(res, await InvitationService.accept(parsed.data));
};
