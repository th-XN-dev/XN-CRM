import { Module } from '@nestjs/common';
import { GroupsModule } from '../groups/groups.module';
import { RoomsModule } from '../rooms/rooms.module';
import { TeachersModule } from '../teachers/teachers.module';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';

@Module({
  imports: [GroupsModule, RoomsModule, TeachersModule],
  controllers: [SchedulesController],
  providers: [SchedulesService],
})
export class SchedulesModule {}
