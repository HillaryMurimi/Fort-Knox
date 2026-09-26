'use client';
import { DEV_DEMO_MODE } from '@/lib/demo/demo-config';
import { demoOrganization } from '@/lib/demo/demo-data';

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
  useOrganizationsQuery,
} from '../hooks/queries/use-organization-queries';

import { useAuth } from '../hooks/use-auth';

import type {
  Organization,
  OrganizationContextValue,
} from '../types/organization';

const ACTIVE_ORGANIZATION_KEY =
  'property-command-center.active-organization';

const DEV_ORGANIZATION_ID =
  DEV_DEMO_MODE ? demoOrganization._id : 'dev-organization-property-command-center';

const DEV_ORGANIZATION =
  {
    _id: DEV_ORGANIZATION_ID,
    name: 'Dapini Properties — Development',
    slug: 'dapini-properties-development',
  } as Organization;

interface ExtendedOrganizationContextValue
  extends OrganizationContextValue {
  error: string | null;
  refreshOrganizations: () => Promise<void>;
}

const OrganizationContext =
  createContext<
    ExtendedOrganizationContextValue | undefined
  >(undefined);

function getStoredOrganizationId():
  | string
  | null {
  if (
    typeof window === 'undefined'
  ) {
    return null;
  }

  return window.localStorage.getItem(
    ACTIVE_ORGANIZATION_KEY,
  );
}

function storeOrganizationId(
  organizationId: string,
): void {
  if (
    typeof window === 'undefined'
  ) {
    return;
  }

  window.localStorage.setItem(
    ACTIVE_ORGANIZATION_KEY,
    organizationId,
  );
}

function clearStoredOrganizationId(): void {
  if (
    typeof window === 'undefined'
  ) {
    return;
  }

  window.localStorage.removeItem(
    ACTIVE_ORGANIZATION_KEY,
  );
}

export function OrganizationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const {
    isAuthenticated,
    isDevMode,
  } = useAuth();

  /*
   * Never query the production organization API
   * while the frontend is running under the explicit
   * development identity.
   */
  const organizationsQuery =
    useOrganizationsQuery(
      isAuthenticated &&
        !isDevMode,
    );

  const realOrganizations =
    organizationsQuery.data ?? [];

  const organizations =
    isDevMode
      ? [DEV_ORGANIZATION]
      : realOrganizations;

  const [
    activeOrganizationId,
    setActiveOrganizationIdState,
  ] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!isAuthenticated) {
      setActiveOrganizationIdState(
        null,
      );

      clearStoredOrganizationId();

      return;
    }

    if (isDevMode) {
      setActiveOrganizationIdState(
        DEV_ORGANIZATION_ID,
      );

      storeOrganizationId(
        DEV_ORGANIZATION_ID,
      );

      return;
    }

    const storedId =
      getStoredOrganizationId();

    const storedOrganization =
      storedId
        ? organizations.find(
            (organization) =>
              organization._id ===
              storedId,
          )
        : undefined;

    const nextOrganization =
      storedOrganization ??
      organizations[0] ??
      null;

    setActiveOrganizationIdState(
      nextOrganization?._id ??
        null,
    );

    if (nextOrganization) {
      storeOrganizationId(
        nextOrganization._id,
      );
    } else if (
      !organizationsQuery.isLoading
    ) {
      clearStoredOrganizationId();
    }
  }, [
    isAuthenticated,
    isDevMode,
    organizations,
    organizationsQuery.isLoading,
  ]);

  const setActiveOrganization =
    useCallback(
      (
        organizationId: string,
      ) => {
        const organization =
          organizations.find(
            (item) =>
              item._id ===
              organizationId,
          );

        if (!organization) {
          return;
        }

        setActiveOrganizationIdState(
          organizationId,
        );

        storeOrganizationId(
          organizationId,
        );
      },
      [organizations],
    );

  const activeOrganization =
    organizations.find(
      (organization) =>
        organization._id ===
        activeOrganizationId,
    ) ?? null;

  const refreshOrganizations =
    useCallback(
      async () => {
        if (isDevMode) {
          return;
        }

        await organizationsQuery.refetch();
      },
      [
        isDevMode,
        organizationsQuery,
      ],
    );

  const error =
    isDevMode
      ? null
      : organizationsQuery.error
          instanceof Error
        ? organizationsQuery.error
            .message
        : organizationsQuery.error
          ? 'Unable to load organizations.'
          : null;

  const value =
    useMemo<ExtendedOrganizationContextValue>(
      () => ({
        organizations,

        activeOrganization,

        activeOrganizationId,

        setActiveOrganization,

        isLoading:
          isDevMode
            ? false
            : organizationsQuery.isLoading,

        error,

        refreshOrganizations,
      }),
      [
        organizations,
        activeOrganization,
        activeOrganizationId,
        setActiveOrganization,
        isDevMode,
        organizationsQuery.isLoading,
        error,
        refreshOrganizations,
      ],
    );

  return (
    <OrganizationContext.Provider
      value={value}
    >
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganizationContext(): ExtendedOrganizationContextValue {
  const context =
    useContext(
      OrganizationContext,
    );

  if (!context) {
    throw new Error(
      'useOrganizationContext must be used inside OrganizationProvider',
    );
  }

  return context;
}

export const useOrganization =
  useOrganizationContext;