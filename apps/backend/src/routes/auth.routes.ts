import { Router } from 'express';
import * as admin from '../modules/auth/admin-auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

import { asyncHandler } from '../core/http/asyncHandler.js';
import * as social from '../modules/auth/social.controller.js';

import {
  acceptInvitation,
  bootstrap,
  login,
  logout,
  refresh,
  requestLoginOtp,
  verifyLogin,
  verifyStepUpOtp,
} from '../modules/auth/auth.controller.js';

export const authRouter = Router();
authRouter.post('/admin-mfa/verify', admin.adminOrigin, asyncHandler(admin.verify));
authRouter.post('/admin-mfa/resend', admin.adminOrigin, asyncHandler(admin.resend));
authRouter.post('/admin-mfa/step-up', admin.adminOrigin, requireAuth, asyncHandler(admin.stepUp));
authRouter.get('/sessions', requireAuth, asyncHandler(admin.sessions));
authRouter.post('/sessions/:sessionId/revoke', admin.adminOrigin, requireAuth, asyncHandler(admin.revoke));
authRouter.post('/logout-all', admin.adminOrigin, requireAuth, asyncHandler(admin.revokeAll));
authRouter.post('/platform-admins', admin.adminOrigin, requireAuth, asyncHandler(admin.promote));

authRouter.get('/social/providers', asyncHandler(social.providers));
authRouter.get('/social/session', asyncHandler(social.status));
authRouter.post('/social/challenge', asyncHandler(social.challenge));
authRouter.post('/social/finish', asyncHandler(social.finish));
authRouter.post('/social/:provider/start', asyncHandler(social.start));
authRouter.get('/social/:provider/callback', asyncHandler(social.callback));

/**
 * Unified authentication entry point.
 *
 * Admin tier:
 *   email + password
 *   -> STEP_UP OTP
 *   -> session
 *
 * Field tier:
 *   phone
 *   -> LOGIN OTP
 *   -> session
 */
authRouter.post(
  '/login',
  asyncHandler(login),
);

/**
 * Legacy phone OTP request.
 *
 * Kept temporarily for backwards compatibility with
 * existing clients and onboarding flows.
 */
authRouter.post(
  '/otp/request',
  asyncHandler(requestLoginOtp),
);

/**
 * Legacy phone OTP verification.
 */
authRouter.post(
  '/otp/verify',
  asyncHandler(verifyLogin),
);

/**
 * Unified field-tier phone OTP verification.
 */
authRouter.post(
  '/verify-otp',
  asyncHandler(verifyLogin),
);

/**
 * Admin-tier second factor verification.
 *
 * Email + password is completed first through /login,
 * then the registered phone receives a STEP_UP OTP.
 */
authRouter.post(
  '/verify-step-up',
  asyncHandler(verifyStepUpOtp),
);

/**
 * Refresh the access token using the httpOnly refresh
 * cookie. No Authorization header is required.
 */
authRouter.post(
  '/refresh',
  asyncHandler(refresh),
);

/**
 * Revoke the current refresh session and clear the
 * refresh-token cookie.
 */
authRouter.post(
  '/logout',
  asyncHandler(logout),
);

/**
 * Public landlord organization bootstrap.
 *
 * Creates:
 *   User
 *   Organization
 *   LANDLORD membership
 */
authRouter.post(
  '/bootstrap-landlord',
  asyncHandler(bootstrap),
);

/**
 * Public invitation acceptance.
 *
 * The invited user does not have an authenticated
 * session yet, so this endpoint must remain public.
 */
authRouter.post(
  '/invitations/accept',
  asyncHandler(acceptInvitation),
);
