import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { type NextFunction, type Request, type Response } from 'express';

/**
 * Per-request data available anywhere down the call chain (services, event
 * publishers, audit) without threading it through every signature.
 */
export interface RequestContext {
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
  /** Domain events published while handling this request (see AuditInterceptor). */
  domainEvents: number;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const currentRequestContext = (): RequestContext | undefined => storage.getStore();

export const REQUEST_ID_HEADER = 'x-request-id';
const VALID_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Accepts a well-formed client `X-Request-ID` (e.g. from a gateway) or
 * generates one, echoes it in the response and opens the request context.
 * Registered before the logger, so logs, errors and audit rows share the id.
 */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const given = req.headers[REQUEST_ID_HEADER];
  const requestId =
    typeof given === 'string' && VALID_REQUEST_ID.test(given) ? given : randomUUID();
  req.headers[REQUEST_ID_HEADER] = requestId;
  res.setHeader('X-Request-ID', requestId);
  storage.run(
    {
      requestId,
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent')?.slice(0, 500) ?? null,
      domainEvents: 0,
    },
    next,
  );
}
