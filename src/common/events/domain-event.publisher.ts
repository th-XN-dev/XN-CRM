import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { type TenantContext } from '../../tenancy/tenant-context';
import { currentRequestContext } from '../context/request-context';
import {
  type AccountEvent,
  type AccountEventName,
  type DomainEvent,
  type EventContext,
} from './domain-events';

type EventInput = Pick<DomainEvent, 'name' | 'entityType' | 'entityId'> & {
  payload?: DomainEvent['payload'];
};

/** Thin, typed wrapper so services never depend on the event bus implementation. */
@Injectable()
export class DomainEventPublisher {
  constructor(private readonly emitter: EventEmitter2) {}

  /** Call only after the transaction has committed. */
  publish(tenant: TenantContext, event: EventInput): void {
    this.publishAs(
      {
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        branchId: tenant.branchId,
      },
      event,
    );
  }

  /**
   * Same, for actions taken outside a member's tenant context — e.g. the
   * platform owner acting on a center (the center is the event's organization).
   */
  publishAs(
    actor: { organizationId: string; userId: string; branchId?: string | null },
    event: EventInput,
  ): void {
    const full: DomainEvent = {
      ...event,
      eventId: randomUUID(),
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      occurredAt: new Date(),
      payload: event.payload ?? {},
      context: eventContext(actor.branchId ?? null),
    };
    this.emitter.emit(full.name, full);
  }

  /** Security events of a user account (login, logout...), outside any organization. */
  publishAccount(name: AccountEventName, userId: string): void {
    const event: AccountEvent = {
      eventId: randomUUID(),
      name,
      userId,
      occurredAt: new Date(),
      context: eventContext(null),
    };
    this.emitter.emit(name, event);
  }
}

/** Captures the current request (and marks that it produced a domain event). */
function eventContext(branchId: string | null): EventContext | undefined {
  const request = currentRequestContext();
  if (!request) return undefined;
  request.domainEvents++;
  return {
    requestId: request.requestId,
    ipAddress: request.ipAddress,
    userAgent: request.userAgent,
    branchId,
  };
}
