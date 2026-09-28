export interface Organization {
  _id: string;
  name: string;
  slug: string;
  createdAt?: string;
  updatedAt?: string;
  status?: 'ACTIVE' | 'SUSPENDED';
  regionalProfile?: {
    countryCode: string;
    baseCurrency: string;
    allowedCurrencies: string[];
    locale: string;
    timeZone: string;
  };
  settings?: {
    managementPhone?: string;
    managementEmail?: string;
    emergencyPhone?: string;
    officeHours?: string;
  };
}

export interface OrganizationMembershipScope {
  allProperties: boolean;
  propertyIds: string[];
  buildingIds: string[];
  unitIds: string[];
}

export interface OrganizationMembership {
  organizationId: string;
  roleIds: string[];
  roles: string[];
  permissions: string[];
  scope: OrganizationMembershipScope;
  status: 'ACTIVE' | 'REMOVED';
}

export interface OrganizationContextValue {
  organizations: Organization[];
  activeOrganization: Organization | null;
  activeOrganizationId: string | null;
  setActiveOrganization: (organizationId: string) => void;
  isLoading: boolean;
  error: string | null;
  refreshOrganizations: () => Promise<void>;
}
