import { Module } from '@nestjs/common';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { FamiliesModule } from '../families/families.module';
import { LeadPipelinesController } from './lead-pipelines.controller';
import { LeadPipelinesService } from './lead-pipelines.service';
import { LeadSourcesController } from './lead-sources.controller';
import { LeadSourcesService } from './lead-sources.service';
import { LeadStagesController } from './lead-stages.controller';
import { LeadStatsService } from './lead-stats.service';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  imports: [FamiliesModule, EnrollmentsModule],
  controllers: [
    LeadsController,
    LeadSourcesController,
    LeadPipelinesController,
    LeadStagesController,
  ],
  providers: [LeadsService, LeadSourcesService, LeadPipelinesService, LeadStatsService],
  exports: [LeadsService, LeadStatsService],
})
export class LeadsModule {}
