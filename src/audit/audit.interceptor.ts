import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Observable, tap } from 'rxjs';
import { currentRequestContext } from '../common/context/request-context';
import { BackgroundTasks } from '../common/events/background-tasks';
import { type AppRequest } from '../common/types/request.types';
import { AuditService } from './audit.service';

const SKIP_AUDIT_KEY = 'skipAudit';

/** Excludes a route from generic auditing (e.g. marking one's own notifications read). */
export const SkipAudit = (): MethodDecorator & ClassDecorator => SetMetadata(SKIP_AUDIT_KEY, true);

const ACTION_BY_METHOD: Record<string, string> = {
  POST: 'CREATE',
  PUT: 'UPDATE',
  PATCH: 'UPDATE',
  DELETE: 'DELETE',
};

/**
 * Safety net for the audit trail: a successful mutating request that did not
 * publish any domain event (those are audited by AuditEventsHandler) is
 * recorded generically as CREATE / UPDATE / DELETE with the sanitized body.
 * This covers configuration endpoints (courses, rooms, branches...) without
 * any audit code in their services, and never double-records evented actions.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
    private readonly background: BackgroundTasks,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<AppRequest>();
    const action = ACTION_BY_METHOD[request.method];
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Anonymous requests (login...) are covered by account events.
    if (!action || skip || !request.user) return next.handle();

    const entityType = context.getClass().name.replace(/Controller$/, '');
    return next.handle().pipe(
      tap((result) => {
        if ((currentRequestContext()?.domainEvents ?? 0) > 0) return;
        const data = unwrap(result);
        const resultId = typeof data?.id === 'string' ? data.id : null;
        const organizationId =
          request.tenant?.organizationId ?? (entityType === 'Organizations' ? resultId : null);
        const params = request.params as Record<string, string | undefined>;
        const request_ = currentRequestContext();
        this.background.run(`audit ${request.method} ${entityType}`, () =>
          this.audit.record({
            organizationId,
            branchId: request.tenant?.branchId ?? null,
            userId: request.user?.id ?? null,
            action,
            entityType,
            entityId: params.id ?? resultId,
            newData: action === 'DELETE' ? undefined : request.body,
            context: request_,
          }),
        );
      }),
    );
  }
}

/** The handler's return value, before or after the response envelope. */
function unwrap(result: unknown): { id?: unknown } | null {
  if (!result || typeof result !== 'object') return null;
  const envelope = result as { success?: unknown; data?: unknown };
  const data = envelope.success === true && 'data' in envelope ? envelope.data : result;
  return data && typeof data === 'object' ? data : null;
}
