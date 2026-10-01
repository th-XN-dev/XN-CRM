import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { RolesModule } from '../roles/roles.module';
import { OwnerAnalyticsService } from './analytics/owner-analytics.service';
import { CenterLifecycleService } from './center-lifecycle.service';
import { CenterBulkService } from './centers/center-bulk.service';
import { CenterPurgeService } from './centers/center-purge.service';
import { OwnerCentersService } from './centers/owner-centers.service';
import { DirectorsService } from './directors/directors.service';
import { OwnerController } from './owner.controller';
import { PlatformGuard } from './platform.guard';

/** The platform owner's area: centers, their lifecycle, directors and global analytics. */
@Module({
  imports: [AuthModule, AuditModule, OrganizationsModule, RolesModule, AnalyticsModule],
  controllers: [OwnerController],
  providers: [
    OwnerCentersService,
    CenterPurgeService,
    CenterBulkService,
    DirectorsService,
    OwnerAnalyticsService,
    CenterLifecycleService,
    PlatformGuard,
  ],
  exports: [PlatformGuard, CenterLifecycleService],
})
export class PlatformModule {}
