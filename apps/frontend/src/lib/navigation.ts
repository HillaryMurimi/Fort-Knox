import type { SystemRoleKey } from "@/types/auth";

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  permission?: string;
  entitlement?: string;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

const item = (
  label: string,
  href: string,
  icon = "LayoutDashboard",
  permission?: string,
  entitlement?: string,
): NavItem => ({
  label,
  href,
  icon,
  ...(permission ? { permission } : {}),
  ...(entitlement ? { entitlement } : {}),
});

export const ROLE_HOME: Record<SystemRoleKey, string> = {
  LANDLORD: "/dashboard",
  TENANT: "/tenant",
  CONTRACTOR: "/contractor",
  CARETAKER: "/caretaker",
  PROPERTY_MANAGER: "/manager",
  SUPER_ADMIN: "/admin",
};

export const ROLE_NAVIGATION: Record<SystemRoleKey, NavSection[]> = {
  LANDLORD: [
    {
      label: "Command",
      items: [
        item("Command Center", "/dashboard"),
        item("Guided pilot", "/pilot", "ListChecks"),
        item("Properties", "/properties", "Building2"),
        item("Finance", "/finance", "CircleDollarSign"),
        item("Maintenance", "/maintenance", "Wrench"),
        item("People & Tenancies", "/tenants", "Users"),
      ],
    },
    {
      label: "Governance",
      items: [
        item("Documents & Evidence", "/documents", "FileText"),
        item("Audit Ledger", "/audit", "History"),
        item("Operations", "/operations", "Activity"),
      ],
    },
    {
      label: "Intelligence",
      items: [
        item("Decision Intelligence", "/intelligence", "BrainCircuit"),
        item("Decision Automation", "/decision-automation", "Workflow"),
        item(
          "Predictive Intelligence",
          "/predictive-intelligence",
          "LineChart",
        ),
        item("ML Governance", "/model-serving", "ShieldCheck"),
      ],
    },
    {
      label: "Connected services",
      items: [
        item("Security & CCTV", "/security", "Shield"),
        item("Integrations", "/integrations", "Workflow"),
        item("Billing & Subscription", "/billing", "CreditCard"),
        item("Notifications", "/notifications", "Bell"),
      ],
    },
  ],

  TENANT: [
    {
      label: "My tenancy",
      items: [
        item("Overview", "/tenant"),
        item("My Home", "/tenant#home", "Home"),
        item("Rent & Payments", "/tenant#payments", "CreditCard"),
        item("Maintenance", "/tenant#maintenance", "Wrench"),
        item("Documents", "/tenant#documents", "FileText"),
        item("Announcements", "/tenant#announcements", "Bell"),
        item("Utilities", "/tenant#utilities", "Activity"),
        item("Emergency", "/tenant#emergency", "ShieldAlert"),
        item("Profile", "/tenant#profile", "User"),
      ],
    },
  ],

  CONTRACTOR: [
    {
      label: "My work",
      items: [
        item("Overview", "/contractor"),
        item("Active Jobs", "/contractor#jobs", "Wrench"),
        item("Job History", "/contractor#history", "History"),
        item("Quotes", "/contractor#quotes", "FileText"),
        item("Invoices", "/contractor#invoices", "CreditCard"),
        item("Performance", "/contractor#performance", "LineChart"),
        item("Documents", "/contractor#documents", "FileText"),
        item("Profile", "/contractor#profile", "User"),
      ],
    },
  ],

  CARETAKER: [
    {
      label: "On site today",
      items: [
        item("Overview", "/caretaker"),
        item("Assigned Buildings", "/caretaker#buildings", "Building2"),
        item("Tenants", "/caretaker#tenants", "Users"),
        item("Maintenance", "/caretaker#maintenance", "Wrench"),
        item("Inspections", "/caretaker#inspections", "ListChecks"),
        item("Inventory", "/caretaker#inventory", "Package"),
        item("Contractors", "/caretaker#contractors", "Users"),
        item("Announcements", "/caretaker#announcements", "Bell"),
        item("Security", "/caretaker#security", "Shield", "cctv.view"),
        item("Tasks & Activity", "/caretaker#activity", "Activity"),
      ],
    },
  ],

  PROPERTY_MANAGER: [
    {
      label: "Assigned portfolio",
      items: [
        item("Overview", "/manager"),
        item("Portfolio", "/manager#portfolio", "Building2"),

        item("Properties", "/properties", "Building2", "property.view"),

        item("Tenants & Tenancies", "/tenants", "Users", "tenant.view"),

        item("Maintenance", "/maintenance", "Wrench"),
        item("Contractors", "/manager#contractors", "Users"),

        item("Finance", "/finance", "CreditCard", "financial-report.view"),

        item("Inspections", "/manager#inspections", "ListChecks"),

        item("Documents", "/documents", "FileText", "document.view"),

        item("Security", "/manager#security", "Shield", "cctv.view"),

        item("Reports", "/finance", "LineChart"),
        item("Team", "/manager#team", "Users"),
        item("Approvals", "/manager#approvals", "ShieldCheck"),
      ],
    },
  ],

  SUPER_ADMIN: [
    {
      label: "Platform",
      items: [
        item("Platform Overview", "/admin", "Globe2"),
        item("Sales demonstration", "/sales-demo", "Workflow"),
        item("Sales intelligence", "/sales-intelligence", "LineChart"),
        item("Organizations", "/platform", "Building2"),
        item("Users & Access", "/admin#users", "Users"),
        item("Roles & Permissions", "/admin#roles", "KeyRound"),
        item("Plans & Subscriptions", "/platform", "CreditCard"),
        item("Entitlements", "/admin#entitlements", "ShieldCheck"),
      ],
    },

    {
      label: "Control plane",
      items: [
        item("Integrations & Health", "/admin#health", "CloudCog"),
        item("Webhooks", "/admin#webhooks", "Workflow"),
        item("Security & Sessions", "/admin#security", "Shield"),
        item("Audit Explorer", "/admin#audit", "History"),
        item("Feature Flags", "/admin#features", "ListChecks"),
        item("Notifications", "/admin#notifications", "Bell"),
        item("Jobs & Queues", "/admin#jobs", "Activity"),
        item("Support & Diagnostics", "/admin#support", "LifeBuoy"),
        item("Analytics", "/admin#analytics", "LineChart"),
      ],
    },

    {
      label: "Organization tools",
      items: [
        item("Properties", "/properties", "Building2"),
        item("Platform Operations", "/operations", "Activity"),
        item("System Configuration", "/settings", "Settings"),
      ],
    },
  ],
};

/**
 * Returns navigation sections available to a role.
 *
 * `preview` is intended only for development/presentation workflows.
 * It must never be treated as backend authorization.
 */
export function navigationFor(
  role: SystemRoleKey,
  permissions: readonly string[] = [],
  preview = false,
): NavSection[] {
  const navigation = ROLE_NAVIGATION[role] ?? [];

  return navigation
    .map((section) => ({
      ...section,
      items: section.items.filter((entry) => {
        if (!entry.permission) {
          return true;
        }

        if (role === "SUPER_ADMIN") {
          return true;
        }

        if (preview) {
          return true;
        }

        if (permissions.includes("*")) {
          return true;
        }

        return permissions.includes(entry.permission);
      }),
    }))
    .filter((section) => section.items.length > 0);
}

/**
 * Determines the most appropriate presentation role for a route.
 *
 * A route matching a dedicated role home takes priority. Otherwise, roles are
 * resolved according to the platform's role precedence.
 */
export function roleForPath(
  roles: readonly SystemRoleKey[],
  path: string,
): SystemRoleKey | undefined {
  const normalizedPath = normalizePath(path);

  const dedicated = (Object.keys(ROLE_HOME) as SystemRoleKey[]).find(
    (role) => ROLE_HOME[role] === normalizedPath && roles.includes(role),
  );

  if (dedicated) {
    return dedicated;
  }

  const precedence: SystemRoleKey[] = [
    "SUPER_ADMIN",
    "LANDLORD",
    "PROPERTY_MANAGER",
    "CARETAKER",
    "CONTRACTOR",
    "TENANT",
  ];

  return precedence.find((role) => roles.includes(role));
}

/**
 * Route families used by Landlords and Property Managers for direct
 * operational drill-down routes.
 *
 * Matches:
 *
 * /buildings
 * /buildings/:id
 * /floors
 * /floors/:id
 * /units
 * /units/:id
 * /tenancies
 * /tenancies/:id
 */
const operationalRoutePattern = /^\/(buildings|floors|units|tenancies)(?:\/|$)/;

/**
 * Determines whether the frontend may PRESENT a route for the selected role.
 *
 * IMPORTANT:
 * This is a presentation/navigation guard only.
 *
 * Backend RBAC/ABAC remains authoritative and must independently enforce:
 * - organization scope
 * - property/building scope
 * - permissions
 * - resource ownership
 * - feature entitlements
 */
export function canPresentRoute(
  role: SystemRoleKey,
  path: string,
  permissions: readonly string[] = [],
  preview = false,
): boolean {
  const normalizedPath = normalizePath(path);

  /**
   * Super Admin controls the platform-level presentation layer.
   */
  if (role === "SUPER_ADMIN") {
    return true;
  }

  /**
   * Settings remains globally presentable for authenticated application
   * users. Backend APIs must still enforce access to privileged settings.
   */
  if (normalizedPath === "/sales-demo" && permissions.includes("sales.demo.manage")) return true;
  if (normalizedPath === "/settings") {
    return true;
  }

  /**
   * Landlords and Property Managers need direct access to hierarchy
   * drill-down routes that might not appear individually in the sidebar.
   */
  if (
    (role === "LANDLORD" || role === "PROPERTY_MANAGER") &&
    operationalRoutePattern.test(normalizedPath)
  ) {
    return true;
  }

  const roots = navigationFor(role, permissions, preview).flatMap((section) =>
    section.items.map((entry) => normalizePath(entry.href)),
  );

  return roots.some(
    (root) =>
      normalizedPath === root ||
      (root !== "/" && normalizedPath.startsWith(`${root}/`)),
  );
}

/**
 * Removes query/hash fragments and normalizes trailing slashes for reliable
 * route comparison.
 */
function normalizePath(path: string): string {
  const withoutHash = path.split("#")[0] ?? "/";
  const withoutQuery = withoutHash.split("?")[0] ?? "/";

  if (!withoutQuery || withoutQuery === "/") {
    return "/";
  }

  return withoutQuery.endsWith("/") ? withoutQuery.slice(0, -1) : withoutQuery;
}
