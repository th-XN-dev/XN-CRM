import { type PlatformRole } from '@prisma/client';
import { type Request } from 'express';
import { type TenantContext } from '../../tenancy/tenant-context';

/** Attached to `req.user` by the JWT strategy. */
export interface AuthUser {
  id: string;
  /** Platform-level role (XN CRM owner); null for center users. */
  platformRole: PlatformRole | null;
  /** Temporary password not changed yet: only account routes are open. */
  mustChangePassword: boolean;
  /** Session (refresh-token family) the access token was issued for. */
  sessionId: string | null;
}

export interface AppRequest extends Request {
  user?: AuthUser;
  tenant?: TenantContext;
}
