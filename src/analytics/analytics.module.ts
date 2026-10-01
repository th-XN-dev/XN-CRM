import { Module } from '@nestjs/common';
import { CenterAnalyticsController } from './center-analytics.controller';
import { CenterAnalyticsService } from './center-analytics.service';
import { HierarchyMetricsService } from './hierarchy-metrics.service';

@Module({
  controllers: [CenterAnalyticsController],
  providers: [HierarchyMetricsService, CenterAnalyticsService],
  exports: [HierarchyMetricsService, CenterAnalyticsService],
})
export class AnalyticsModule {}
