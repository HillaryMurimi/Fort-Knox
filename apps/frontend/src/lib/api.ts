import {
  clearStoredAuthSession,
  getStoredAuthSession,
  updateStoredAccessToken,
} from './auth/auth-storage';

import {
  isDevAuthBypassEnabled,
} from './auth/dev-auth';

import {
  DEV_DEMO_MODE,
} from './demo/demo-config';

import {
  demoApi,
} from './demo/demo-provider';

export function resolveApiBaseUrl(
  configuredUrl = process.env.NEXT_PUBLIC_API_URL,
  environment = process.env.NODE_ENV,
): string {
  if (environment === 'production') {
    if (!configuredUrl) {
      throw new Error('NEXT_PUBLIC_API_URL is required for a production build');
    }
    if (!configuredUrl.startsWith('https://') && !configuredUrl.startsWith('/')) {
      const parsed = new URL(configuredUrl);
      const loopback = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
      if (!loopback || parsed.protocol !== 'http:') {
        throw new Error('NEXT_PUBLIC_API_URL must use HTTPS or a same-origin path in production');
      }
    }
  }
  return (configuredUrl ?? 'http://localhost:9000/api/v1').replace(/\/$/, '');
}

const API_BASE_URL = resolveApiBaseUrl();

export interface ApiResponseBody {
  success?: boolean;
  message?: string;
  error?: unknown;
  code?: string;
  requestId?: string;
  details?: unknown;
  data?: unknown;
}

export type ApiErrorBody = ApiResponseBody;

export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiResponseBody | null;

  constructor(
    message: string,
    status: number,
    body: ApiResponseBody | null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

interface ApiRequestOptions extends RequestInit {
  responseType?: 'blob';
  /**
   * Whether this request requires an authenticated access token.
   *
   * Public authentication endpoints must explicitly use:
   *
   *   authenticated: false
   *
   * This prevents failed login/signup/OTP requests from incorrectly
   * triggering the refresh-token flow.
   */
  authenticated?: boolean;
}

/**
 * Safely parse an API response body.
 */
async function parseResponseBody(
  response: Response,
): Promise<ApiResponseBody | null> {
  const contentType = response.headers.get('content-type');

  if (!contentType?.includes('application/json')) {
    return null;
  }

  try {
    return (await response.json()) as ApiResponseBody;
  } catch {
    return null;
  }
}

/**
 * Extract a human-readable message from the backend error envelope.
 *
 * Handles all of these shapes:
 *
 * { "message": "Authentication is required" }
 *
 * { "error": "Authentication is required" }
 *
 * {
 *   "error": {
 *     "message": "Authentication is required"
 *   }
 * }
 *
 * {
 *   "details": {
 *     "message": "Authentication is required"
 *   }
 * }
 *
 * The function ALWAYS returns a string.
 *
 * This is important because rendering an object directly produces:
 *
 *   [object Object]
 */
function extractApiErrorMessage(
  body: ApiResponseBody | null,
  fallback: string,
): string {
  if (!body) {
    return fallback;
  }

  /**
   * Standard top-level message.
   */
  if (
    typeof body.message === 'string' &&
    body.message.trim().length > 0
  ) {
    return body.message;
  }

  /**
   * String-form error.
   */
  if (
    typeof body.error === 'string' &&
    body.error.trim().length > 0
  ) {
    return body.error;
  }

  /**
   * Nested error object:
   *
   * error: {
   *   message: "..."
   * }
   */
  if (
    typeof body.error === 'object' &&
    body.error !== null &&
    'message' in body.error
  ) {
    const nestedMessage = (
      body.error as {
        message?: unknown;
      }
    ).message;

    if (
      typeof nestedMessage === 'string' &&
      nestedMessage.trim().length > 0
    ) {
      return nestedMessage;
    }
  }

  /**
   * Nested details object:
   *
   * details: {
   *   message: "..."
   * }
   */
  if (
    typeof body.details === 'object' &&
    body.details !== null &&
    'message' in body.details
  ) {
    const detailMessage = (
      body.details as {
        message?: unknown;
      }
    ).message;

    if (
      typeof detailMessage === 'string' &&
      detailMessage.trim().length > 0
    ) {
      return detailMessage;
    }
  }

  /**
   * Some APIs return:
   *
   * error: {
   *   code: "...",
   *   detail: "..."
   * }
   */
  if (
    typeof body.error === 'object' &&
    body.error !== null &&
    'detail' in body.error
  ) {
    const detail = (
      body.error as {
        detail?: unknown;
      }
    ).detail;

    if (
      typeof detail === 'string' &&
      detail.trim().length > 0
    ) {
      return detail;
    }
  }

  return fallback;
}

/**
 * Perform the raw HTTP request.
 *
 * This function:
 * - attaches Authorization when an access token exists
 * - sends cookies
 * - disables browser caching
 * - parses the API response envelope
 *
 * It does NOT perform refresh-token recovery.
 */
async function sendRawRequest<T>(
  path: string,
  init: ApiRequestOptions,
  accessToken?: string,
): Promise<{
  value?: T;
  response: Response;
  body: ApiResponseBody | null;
}> {
  const {
    authenticated = true,
    responseType: _responseType,
    headers: providedHeaders,
    ...requestInit
  } = init;

  void _responseType;
  const headers = new Headers(providedHeaders);
  headers.set('X-PCC-Auth', '1');

  /**
   * JSON is the default for this API.
   *
   * Do not overwrite an explicitly supplied Content-Type.
   */
  const isFormData = typeof FormData !== 'undefined' && requestInit.body instanceof FormData;
  if (!headers.has('Content-Type') && !isFormData) {
    headers.set('Content-Type', 'application/json');
  }

  /**
   * Attach the access token only to authenticated requests.
   */
  if (authenticated && accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestInit,
    headers,

    /**
     * Required for the httpOnly refresh-token cookie.
     */
    credentials: 'include',

    /**
     * Authentication and command-center requests should not be
     * served from the browser HTTP cache.
     */
    cache: 'no-store',
  });

  const body = await parseResponseBody(response);

  return {
    response,
    body,
  };
}

/**
 * Main API client.
 *
 * Behavior:
 *
 * Authenticated request
 *      ↓
 * 401?
 *      ↓ yes
 * POST /auth/refresh
 *      ↓
 * new access token
 *      ↓
 * retry original request once
 *
 * Public requests never enter this refresh path.
 *
 * Development demo data mode:
 *
 * When NEXT_PUBLIC_DEV_DEMO_MODE=true, authenticated
 * requests are served from the local demo dataset via
 * demoApi() instead of the real backend. This lets the
 * full UI (Command Center, finance, maintenance, etc.)
 * run without a backend.
 *
 * Public authentication requests (authenticated: false)
 * always use the real backend, even in demo mode.
 *
 * Development authentication bypass:
 *
 * When dev auth is enabled without demo mode, the access
 * token is a local simulation ("dev-bypass-<role>"). The
 * real backend cannot validate it, so every authenticated
 * request returns 401. In that mode we deliberately SKIP
 * the refresh-token recovery path, because clearing the
 * session and redirecting to /login loops forever against
 * AuthProvider's dev-session regeneration.
 */
let privilegedRefreshInFlight: Promise<{ response: Response; body: ApiResponseBody | null }> | null = null;
function rawRequest<T>(path: string, init: ApiRequestOptions, accessToken?: string): Promise<{ value?: T; response: Response; body: ApiResponseBody | null }> {
  if (path !== '/auth/refresh') return sendRawRequest<T>(path, init, accessToken);
  if (!privilegedRefreshInFlight) privilegedRefreshInFlight = sendRawRequest<T>(path, init, accessToken).finally(() => { privilegedRefreshInFlight = null; });
  return privilegedRefreshInFlight;
}

export async function api<T>(
  path: string,
  init: ApiRequestOptions = {},
): Promise<T> {
  const {
    authenticated = true,
  } = init;

  /**
   * Demo data mode intercepts authenticated requests
   * and serves them from the local demo dataset.
   *
   * getDemoRole() reads the current demo role from
   * localStorage on every call, so the role switcher
   * takes effect immediately without a reload.
   */
  if (
    DEV_DEMO_MODE &&
    !path.startsWith('/sales/') &&
    !path.startsWith('/platform-control/sales-intelligence') &&
    authenticated &&
    typeof window !== 'undefined'
  ) {
    return demoApi<T>(
      path,
      init,
    );
  }

  /**
   * Only authenticated requests read the stored access token.
   */
  if (authenticated && isDevAuthBypassEnabled()) throw new ApiError('Preview data is not enabled. Enable development demo mode to explore this workspace.', 503, null);

  const session = authenticated
    ? getStoredAuthSession()
    : null;

  let {
    response,
    body,
  } = await rawRequest<T>(
    path,
    init,
    session?.accessToken,
  );

  /**
   * Only authenticated browser requests are eligible for
   * automatic access-token refresh.
   *
   * This is critical for:
   *
   * /auth/login
   * /auth/verify-otp
   * /auth/verify-step-up
   * /auth/bootstrap-landlord
   *
   * because these requests happen BEFORE authentication exists.
   */
  if (
    !response.ok &&
    authenticated &&
    response.status === 401 &&
    typeof window !== 'undefined'
  ) {
    /**
     * Development authentication bypass.
     *
     * A 401 against the real backend is EXPECTED when using a
     * simulated dev identity. Never attempt refresh, never clear
     * the session, and never redirect to /login — the provider
     * will immediately regenerate the session and the login page
     * will push back into the app, looping forever.
     */
    if (
      isDevAuthBypassEnabled() &&
      Boolean(
        session?.accessToken?.startsWith(
          'dev-bypass-',
        ),
      )
    ) {
      const message = extractApiErrorMessage(
        body,
        'The development session cannot reach the real backend.',
      );

      throw new ApiError(
        message,
        response.status,
        body,
      );
    }

    const refresh = await rawRequest<{
      accessToken: string;
    }>(
      '/auth/refresh',
      {
        method: 'POST',
        authenticated: false,
      },
    );

    /**
     * A successful refresh returns:
     *
     * {
     *   success: true,
     *   data: {
     *     accessToken: "..."
     *   }
     * }
     */
    if (
      refresh.response.ok &&
      refresh.body?.success === true &&
      typeof refresh.body.data === 'object' &&
      refresh.body.data !== null &&
      'accessToken' in refresh.body.data &&
      typeof (
        refresh.body.data as {
          accessToken?: unknown;
        }
      ).accessToken === 'string'
    ) {
      const refreshed = refresh.body.data as {
        accessToken: string;
      };

      /**
       * Store ONLY the new access token.
       *
       * The refresh token remains an httpOnly cookie and is never
       * exposed to JavaScript.
       */
      updateStoredAccessToken(refreshed.accessToken);

      /**
       * Retry the original request exactly once using the
       * newly issued access token.
       */
      ({
        response,
        body,
      } = await rawRequest<T>(
        path,
        init,
        refreshed.accessToken,
      ));
    } else {
      /**
       * Refresh failed.
       *
       * Clear the local access-token session and return the
       * user to login.
       */
      clearStoredAuthSession();

      if (
        window.location.pathname !== '/login'
      ) {
        window.location.replace('/login');
      }
    }
  }

  /**
   * Convert all failed API responses into ApiError instances
   * with a guaranteed string message.
   *
   * This prevents:
   *
   *   [object Object]
   */
  if (!response.ok) {
    if (typeof window !== 'undefined' && response.status === 403 && typeof body?.error === 'object' && body.error && 'code' in body.error && body.error.code === 'FRESH_AUTH_REQUIRED')
      window.dispatchEvent(new Event('pcc:admin-step-up'));
    const message = extractApiErrorMessage(
      body,
      `Request failed (${response.status})`,
    );

    throw new ApiError(
      message,
      response.status,
      body,
    );
  }

  if (init.responseType === 'blob') return await response.blob() as T;

  /**
   * Backend API convention:
   *
   * {
   *   success: true,
   *   data: ...
   * }
   *
   * Return the data portion directly.
   */
  if (
    body &&
    body.success === true
  ) {
    return body.data as T;
  }

  /**
   * Fallback for endpoints that return a raw JSON object.
   */
  return body as T;
}
