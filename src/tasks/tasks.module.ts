import { Module } from '@nestjs/common';
import { HrModule } from '../hr/hr.module';
import { TaskAccessService } from './task-access.service';
import { TaskCommentsService } from './task-comments.service';
import { TaskHistoryService } from './task-history.service';
import { TaskRelationsService } from './task-relations.service';
import { TaskStatsService } from './task-stats.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [HrModule],
  controllers: [TasksController],
  providers: [
    TasksService,
    TaskAccessService,
    TaskHistoryService,
    TaskCommentsService,
    TaskRelationsService,
    TaskStatsService,
  ],
  exports: [TaskStatsService],
})
export class TasksModule {}
