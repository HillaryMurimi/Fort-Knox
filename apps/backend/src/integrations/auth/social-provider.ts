import * as oauth from 'oauth4webapi';
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/AppError.js';

export const socialProviderSchema = z.enum(['google', 'facebook', 'apple']);
export type SocialProvider = z.infer<typeof socialProviderSchema>;
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const appleKeys = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

export function availableSocialProviders() {
  return { google: Boolean(env.GOOGLE_CLIENT_ID), facebook: Boolean(env.FACEBOOK_CLIENT_ID), apple: Boolean(env.APPLE_CLIENT_ID) };
}

function configuration(provider: SocialProvider) {
  if (!availableSocialProviders()[provider] || !env.PUBLIC_API_URL) throw new AppError(503, 'OAUTH_UNAVAILABLE', 'This sign-in provider is not configured. Use email or phone sign-in.');
  const configurations = {
    google: { clientId: env.GOOGLE_CLIENT_ID!, issuer: 'https://accounts.google.com', authorization: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token' },
    facebook: { clientId: env.FACEBOOK_CLIENT_ID!, issuer: 'https://www.facebook.com', authorization: `https://www.facebook.com/${env.FACEBOOK_GRAPH_VERSION}/dialog/oauth`, token: `https://graph.facebook.com/${env.FACEBOOK_GRAPH_VERSION}/oauth/access_token` },
    apple: { clientId: env.APPLE_CLIENT_ID!, issuer: 'https://appleid.apple.com', authorization: 'https://appleid.apple.com/auth/authorize', token: 'https://appleid.apple.com/auth/token' },
  };
  return { ...configurations[provider], redirect: `${env.PUBLIC_API_URL.replace(/\/$/, '')}${env.API_PREFIX}/auth/social/${provider}/callback` };
}

export async function socialAuthorizationUrl(provider: SocialProvider, state: string, nonce: string, verifier: string) {
  const config = configuration(provider);
  const url = new URL(config.authorization);
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirect, response_type: 'code', state }).toString();
  if (provider === 'google') {
    url.searchParams.set('scope', 'openid');
    url.searchParams.set('code_challenge', await oauth.calculatePKCECodeChallenge(verifier));
    url.searchParams.set('code_challenge_method', 'S256');
  }
  // Apple with no profile scopes uses a GET callback, preserving SameSite=Lax browser binding.
  // Names and contact details are collected explicitly during organization setup.
  if (provider !== 'facebook') url.searchParams.set('nonce', nonce);
  return url.toString();
}

export async function verifySocialCode(provider: SocialProvider, parameters: URLSearchParams, state: string, nonce: string, verifier: string): Promise<string> {
  const config = configuration(provider);
  const server: oauth.AuthorizationServer = { issuer: config.issuer, token_endpoint: config.token };
  const client: oauth.Client = { client_id: config.clientId };
  let secret = provider === 'google' ? env.GOOGLE_CLIENT_SECRET! : env.FACEBOOK_CLIENT_SECRET!;
  if (provider === 'apple') {
    const key = await importPKCS8(env.APPLE_PRIVATE_KEY!.replace(/\\n/g, '\n'), 'ES256');
    secret = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: env.APPLE_KEY_ID! }).setIssuer(env.APPLE_TEAM_ID!).setSubject(config.clientId).setAudience(config.issuer).setIssuedAt().setExpirationTime('5m').sign(key);
  }
  const validated = oauth.validateAuthResponse(server, client, parameters, state);
  const response = await oauth.authorizationCodeGrantRequest(server, client, oauth.ClientSecretPost(secret), validated, config.redirect, provider === 'google' ? verifier : oauth.nopkce, { signal: AbortSignal.timeout(15000) });
  const tokens = await oauth.processAuthorizationCodeResponse(server, client, response, provider === 'facebook' ? {} : { expectedNonce: nonce, requireIdToken: true });
  if (provider === 'facebook') {
    const profile = await fetch(`https://graph.facebook.com/${env.FACEBOOK_GRAPH_VERSION}/me?fields=id`, { headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(15000) });
    if (!profile.ok) throw new AppError(502, 'OAUTH_PROVIDER_ERROR', 'Unable to verify provider identity.');
    return z.object({ id: z.string().min(1).max(255) }).parse(await profile.json()).id;
  }
  const { payload } = await jwtVerify(tokens.id_token!, provider === 'google' ? googleKeys : appleKeys, { issuer: config.issuer, audience: config.clientId, algorithms: ['RS256'], requiredClaims: ['sub', 'exp', 'iat', 'nonce'] });
  if (payload.nonce !== nonce || !payload.sub) throw new AppError(401, 'OAUTH_IDENTITY_INVALID', 'Unable to verify provider identity.');
  return payload.sub;
}
