import type { Request, RequestHandler } from 'express';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/AppError.js';
import { sendSuccess } from '../../core/response/apiResponse.js';
import { availableSocialProviders, socialProviderSchema } from '../../integrations/auth/social-provider.js';
import { callbackSocial, challengeSocial, finishSocial, socialStatus, startSocial } from './social.service.js';
import { socialCodeSchema } from './social.schemas.js';
import { setRefreshCookie } from './auth.controller.js';

const cookieName = 'pmcc_social_flow';
const options = { httpOnly: true, secure: env.REFRESH_COOKIE_SECURE, sameSite: 'lax' as const, path: `${env.API_PREFIX}/auth/social`, maxAge: 600000 };
const token = (req: Request): string => typeof req.cookies?.[cookieName] === 'string' ? req.cookies[cookieName] as string : '';
function assertOrigin(req: Request) {
  if (req.get('origin') !== new URL(env.WEB_ORIGIN).origin) throw new AppError(403, 'ORIGIN_DENIED', 'This sign-in request is not allowed.');
}
export const providers: RequestHandler = (_req, res) => { res.set('Cache-Control', 'no-store'); sendSuccess(res, availableSocialProviders()); };
export const start: RequestHandler = async (req, res) => {
  assertOrigin(req);
  const provider = socialProviderSchema.parse(req.params.provider);
  const result = await startSocial(provider);
  res.cookie(cookieName, result.token, options).set('Cache-Control', 'no-store');
  sendSuccess(res, { url: result.url });
};
export const callback: RequestHandler = async (req, res) => {
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  try {
    const provider = socialProviderSchema.parse(req.params.provider);
    const parameters = new URL(req.originalUrl, env.WEB_ORIGIN).searchParams;
    const next = await callbackSocial(provider, token(req), parameters);
    res.cookie(cookieName, next, options).redirect(303, `${env.WEB_ORIGIN.replace(/\/$/, '')}/welcome`);
  } catch {
    res.clearCookie(cookieName, options).redirect(303, `${env.WEB_ORIGIN.replace(/\/$/, '')}/welcome?error=provider`);
  }
};
export const status: RequestHandler = async (req, res) => { res.set('Cache-Control', 'no-store'); sendSuccess(res, await socialStatus(token(req))); };
export const challenge: RequestHandler = async (req, res) => { assertOrigin(req); sendSuccess(res, await challengeSocial(token(req), req.body)); };
export const finish: RequestHandler = async (req, res) => {
  assertOrigin(req);
  const { code } = socialCodeSchema.parse(req.body);
  const result = await finishSocial(token(req), code, { ...(req.ip ? { ipAddress: req.ip } : {}), ...(req.get('user-agent') ? { userAgent: req.get('user-agent')! } : {}) });
  setRefreshCookie(res, result.refreshToken);
  res.clearCookie(cookieName, options).set('Cache-Control', 'no-store');
  sendSuccess(res, { newOwner: result.newOwner });
};
