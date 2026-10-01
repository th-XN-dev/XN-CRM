import { Module } from '@nestjs/common';
import { LeadsModule } from '../leads/leads.module';
import { TasksModule } from '../tasks/tasks.module';
import { AttendanceReportsService } from './academic/attendance-reports.service';
import { StudentReportsService } from './academic/student-reports.service';
import { LeadReportsService } from './crm/lead-reports.service';
import { TaskReportsService } from './crm/task-reports.service';
import { FinanceReportsService } from './finance/finance-reports.service';
import {
  AttendanceReportsController,
  FinanceReportsController,
  LeadReportsController,
  StudentReportsController,
  TaskReportsController,
} from './reports.controllers';

/** One small service per domain — no catch-all ReportService. */
@Module({
  imports: [LeadsModule, TasksModule],
  controllers: [
    FinanceReportsController,
    StudentReportsController,
    AttendanceReportsController,
    LeadReportsController,
    TaskReportsController,
  ],
  providers: [
    FinanceReportsService,
    StudentReportsService,
    AttendanceReportsService,
    LeadReportsService,
    TaskReportsService,
  ],
  exports: [
    FinanceReportsService,
    StudentReportsService,
    AttendanceReportsService,
    LeadReportsService,
    TaskReportsService,
  ],
})
export class ReportsModule {}
