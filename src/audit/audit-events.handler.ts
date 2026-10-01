import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BackgroundTasks } from '../common/events/background-tasks';
import {
  type AccountEvent,
  AccountEventName,
  type DomainEvent,
} from '../common/events/domain-events';
import { AuditService } from './audit.service';

const ACCOUNT_ACTIONS: Record<AccountEventName, string> = {
  [AccountEventName.REGISTERED]: 'REGISTER',
  [AccountEventName.LOGIN]: 'LOGIN',
  [AccountEventName.LOGOUT]: 'LOGOUT',
  [AccountEventName.TOKEN_REFRESHED]: 'TOKEN_REFRESHED',
  [AccountEventName.PASSWORD_CHANGED]: 'PASSWORD_CHANGED',
};

const ACCOUNT_ACTIONS_BY_NAME = ACCOUNT_ACTIONS as Record<string, string>;

/** "payment.created" → "PAYMENT_CREATED", "cash_session.closed" → "CASH_SESSION_CLOSED". */
export const auditActionOf = (eventName: string): string =>
  eventName.replace(/\./g, '_').toUpperCase();

/**
 * Every domain event becomes an audit row — services never write audit code.
 * Events are published after commit, so a row always describes a real change.
 */
@Injectable()
export class AuditEventsHandler {
  constructor(
    private readonly audit: AuditService,
    private readonly background: BackgroundTasks,
  ) {}

  @OnEvent('**')
  onEvent(event: unknown): void {
    if (isAccountEvent(event)) {
      this.background.run(`audit ${event.name}`, () =>
        this.audit.record({
          organizationId: null,
          userId: event.userId,
          action: ACCOUNT_ACTIONS[event.name],
          entityType: 'User',
          entityId: event.userId,
          context: event.context,
        }),
      );
      return;
    }
    if (!isDomainEvent(event)) return;

    const { from, ...rest } = event.payload;
    const branchId =
      typeof event.payload.branchId === 'string'
        ? event.payload.branchId
        : (event.context?.branchId ?? null);
    this.background.run(`audit ${event.name}`, () =>
      this.audit.record({
        organizationId: event.organizationId,
        branchId,
        userId: event.actorUserId,
        action: auditActionOf(event.name),
        entityType: event.entityType,
        entityId: event.entityId,
        // `{ from, to }` payloads map naturally to before/after.
        oldData: from === undefined ? undefined : { from },
        newData: rest,
        context: event.context,
      }),
    );
  }
}

function isAccountEvent(event: unknown): event is AccountEvent {
  const name = (event as { name?: unknown } | null)?.name;
  return typeof name === 'string' && name.startsWith('account.') && name in ACCOUNT_ACTIONS_BY_NAME;
}

function isDomainEvent(event: unknown): event is DomainEvent {
  const candidate = event as Partial<DomainEvent> | null;
  return (
    !!candidate &&
    typeof candidate.eventId === 'string' &&
    typeof candidate.organizationId === 'string' &&
    typeof candidate.entityType === 'string' &&
    typeof candidate.name === 'string'
  );
}
