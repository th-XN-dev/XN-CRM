import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditController } from './audit.controller';
import { AuditEventsHandler } from './audit-events.handler';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';

/**
 * Request → Controller → Service → domain event → AuditEventsHandler → AuditLog,
 * plus AuditInterceptor for mutations that publish no event.
 */
@Module({
  controllers: [AuditController],
  providers: [
    AuditService,
    AuditEventsHandler,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [AuditService],
})
export class AuditModule {}
