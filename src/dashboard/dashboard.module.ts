import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReportsModule } from '../reports/reports.module';
import { TasksModule } from '../tasks/tasks.module';
import { DashboardController } from './dashboard.controller';
import { DashboardAnalyticsService } from './dashboard-analytics.service';
import { DashboardLayoutService } from './dashboard-layout.service';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [ReportsModule, TasksModule, NotificationsModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardAnalyticsService, DashboardLayoutService],
})
export class DashboardModule {}
