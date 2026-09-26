'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  acceptInvitation,
  bootstrapLandlord,
  login,
  logoutRequest,
  refreshAuth,
  verifyLoginOtp,
  verifyStepUp,
} from '../lib/auth/auth-api';

import {
  clearStoredAuthSession,
  getStoredAuthSession,
  setStoredAuthSession,
} from '../lib/auth/auth-storage';

import {
  createDevAuthSession,
  DEV_PREVIEW_ROLE_CHANGED_EVENT,
  disableDevAuth,
  getDevAuthRole,
  isDevAuthBypassEnabled,
} from '../lib/auth/dev-auth';

import type {
  AuthUser,
  LoginChallengeResponse,
  LoginPayload,
  LoginResponse,
  StoredAuthSession,
  SystemRoleKey,
} from '../types/auth';

interface AuthContextValue {
  user: AuthUser | null;
  roles: SystemRoleKey[];
  memberships: StoredAuthSession['memberships'];
  session: StoredAuthSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isDevMode: boolean;

  login: (
    payload: LoginPayload,
  ) => Promise<LoginChallengeResponse | LoginResponse>;

  verifyOtp: (
    phone: string,
    code: string,
  ) => Promise<LoginResponse>;

  verifyStepUp: (
    email: string,
    code: string,
  ) => Promise<LoginResponse>;

  bootstrapLandlord: (
    payload: unknown,
  ) => Promise<unknown>;

  acceptInvitation: (
    payload: unknown,
  ) => Promise<unknown>;

  logout: () => Promise<void>;

  refresh: () => Promise<LoginResponse>;
}

const AuthContext =
  createContext<AuthContextValue | undefined>(
    undefined,
  );

function isLoginResponse(
  value:
    | LoginChallengeResponse
    | LoginResponse,
): value is LoginResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'accessToken' in value &&
    typeof (
      value as {
        accessToken?: unknown;
      }
    ).accessToken === 'string'
  );
}

function persist(
  response: LoginResponse,
): LoginResponse {
  const session: StoredAuthSession = {
    accessToken: response.accessToken,
    user: response.user,
    roles: response.roles,
    memberships: response.memberships,
    authenticatedAt:
      new Date().toISOString(),
  };

  setStoredAuthSession(session);

  return response;
}

function getDevSession():
  | StoredAuthSession
  | null {
  if (!isDevAuthBypassEnabled()) {
    return null;
  }

  const role = getDevAuthRole();

  if (!role) {
    return null;
  }

  return createDevAuthSession(role);
}

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [
    session,
    setSession,
  ] = useState<StoredAuthSession | null>(
    () =>
      getDevSession() ??
      getStoredAuthSession(),
  );

  const [
    isLoading,
    setIsLoading,
  ] = useState(false);

  const [
    isDevMode,
    setIsDevMode,
  ] = useState(() =>
    isDevAuthBypassEnabled(),
  );

  /*
   * Development identity synchronization.
   *
   * The existing dev-role switcher writes the selected
   * role into dev-auth storage. We intentionally keep
   * this synchronization inside AuthProvider so every
   * consumer of useAuth() receives the same identity.
   *
   * A custom event updates the current tab immediately;
   * the storage event keeps additional tabs synchronized.
   */
  useEffect(() => {
    if (
      !isDevAuthBypassEnabled()
    ) {
      setIsDevMode(false);

      const realSession =
        getStoredAuthSession();

      setSession(realSession);

      return;
    }

    setIsDevMode(true);

    const synchronizeDevIdentity =
      () => {
        const enabled =
          isDevAuthBypassEnabled();

        setIsDevMode(enabled);

        if (!enabled) {
          setSession(
            getStoredAuthSession(),
          );
          return;
        }

        const nextSession =
          getDevSession();

        if (nextSession) {
          setSession(nextSession);
        }
      };

    synchronizeDevIdentity();

    window.addEventListener(
      DEV_PREVIEW_ROLE_CHANGED_EVENT,
      synchronizeDevIdentity,
    );
    window.addEventListener(
      'storage',
      synchronizeDevIdentity,
    );

    return () => {
      window.removeEventListener(
        DEV_PREVIEW_ROLE_CHANGED_EVENT,
        synchronizeDevIdentity,
      );
      window.removeEventListener(
        'storage',
        synchronizeDevIdentity,
      );
    };
  }, []);

  const doLogin = useCallback(
    async (
      payload: LoginPayload,
    ): Promise<
      | LoginChallengeResponse
      | LoginResponse
    > => {
      setIsLoading(true);

      try {
        const result =
          await login(payload);

        if (!isLoginResponse(result)) {
          return result;
        }

        const persisted =
          persist(result);

        setSession(
          getStoredAuthSession(),
        );

        return persisted;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const doVerifyOtp = useCallback(
    async (
      phone: string,
      code: string,
    ): Promise<LoginResponse> => {
      setIsLoading(true);

      try {
        const result = persist(
          await verifyLoginOtp({
            phone,
            code,
          }),
        );

        setSession(
          getStoredAuthSession(),
        );

        return result;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const doVerifyStepUp = useCallback(
    async (
      email: string,
      code: string,
    ): Promise<LoginResponse> => {
      setIsLoading(true);

      try {
        const result = persist(
          await verifyStepUp(
            email,
            code,
          ),
        );

        setSession(
          getStoredAuthSession(),
        );

        return result;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const doLogout = useCallback(
    async (): Promise<void> => {
      /*
       * In development mode, "Sign out" means
       * leave the simulated identity rather than
       * touching a real backend session.
       */
      if (
        isDevAuthBypassEnabled()
      ) {
        disableDevAuth();
        setIsDevMode(false);
        setSession(
          getStoredAuthSession(),
        );
        return;
      }

      try {
        await logoutRequest();
      } finally {
        clearStoredAuthSession();
        setSession(null);
      }
    },
    [],
  );

  const doRefresh = useCallback(
    async (): Promise<LoginResponse> => {
      /*
       * Dev sessions do not need refresh-token
       * rotation. The development identity is
       * regenerated from the selected role.
       */
      if (
        isDevAuthBypassEnabled()
      ) {
        const devSession =
          getDevSession();

        if (!devSession) {
          throw new Error(
            'Development authentication is enabled but no development role is selected.',
          );
        }

        setSession(devSession);

        return {
          accessToken:
            devSession.accessToken,
          user: devSession.user,
          roles: devSession.roles,
          memberships:
            devSession.memberships,
          expiresAt:
            devSession.authenticatedAt,
        };
      }

      const result = persist(
        await refreshAuth(),
      );

      setSession(
        getStoredAuthSession(),
      );

      return result;
    },
    [],
  );

  const value =
    useMemo<AuthContextValue>(
      () => ({
        user:
          session?.user ?? null,

        roles:
          session?.roles ?? [],

        memberships:
          session?.memberships ?? [],

        session,

        isAuthenticated:
          Boolean(
            session?.accessToken,
          ),

        isLoading,

        isDevMode,

        login: doLogin,

        verifyOtp:
          doVerifyOtp,

        verifyStepUp:
          doVerifyStepUp,

        bootstrapLandlord,

        acceptInvitation,

        logout: doLogout,

        refresh: doRefresh,
      }),
      [
        session,
        isLoading,
        isDevMode,
        doLogin,
        doVerifyOtp,
        doVerifyStepUp,
        doLogout,
        doRefresh,
      ],
    );

  return (
    <AuthContext.Provider
      value={value}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextValue {
  const context =
    useContext(AuthContext);

  if (!context) {
    throw new Error(
      'useAuthContext must be used inside AuthProvider',
    );
  }

  return context;
}
