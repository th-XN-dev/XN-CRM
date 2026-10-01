export type Locale = 'uz' | 'ru' | 'en';

export interface User {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  /** Seconds. */
  expiresIn: number;
}

export interface AuthResult {
  user: User;
  tokens: TokenPair;
}

/** Whether members can use a center right now (status + activation period), decided by the API. */
export type CenterAvailability = 'ACTIVE' | 'FROZEN' | 'ARCHIVED' | 'EXPIRED' | 'NOT_STARTED';

/** A center (organization) as listed in the selector (from GET /auth/me). */
export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string;
  role: { key: string; name: string };
  availability: CenterAvailability;
}

export interface Profile extends User {
  /** XN CRM platform owner (owner area); null for center users. */
  platformRole: 'OWNER' | null;
  /** Signed in with a temporary password that must be replaced first. */
  mustChangePassword: boolean;
  organizations: OrganizationSummary[];
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string | null;
  language: Locale;
  timezone: string;
  currency: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: 'ACTIVE' | 'FROZEN' | 'ARCHIVED';
  activeFrom: string | null;
  activeUntil: string | null;
}

export interface BranchRef {
  id: string;
  name: string;
  code: string;
  subCenterId?: string | null;
}

/** GET /organizations/:id/context — drives branding, RBAC UI and the branch selector. */
export interface OrganizationContext {
  organization: Organization;
  /** `tier`: DIRECTOR runs the center; everyone else is STAFF with granular permissions. */
  membership: { role: string; tier: 'DIRECTOR' | 'STAFF'; permissions: string[]; allBranches: boolean };
  branches: BranchRef[];
}
