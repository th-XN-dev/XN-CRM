import { Module } from '@nestjs/common';
import { HrModule } from '../hr/hr.module';
import { ChecklistSchedulerService } from './checklist-scheduler.service';
import { ChecklistsController } from './checklists.controller';
import { ChecklistsService } from './checklists.service';

@Module({
  imports: [HrModule],
  controllers: [ChecklistsController],
  providers: [ChecklistsService, ChecklistSchedulerService],
  exports: [ChecklistsService, ChecklistSchedulerService],
})
export class ChecklistsModule {}
