import { Module } from '@nestjs/common';
import { CoursesModule } from '../courses/courses.module';
import { RoomsModule } from '../rooms/rooms.module';
import { TeachersModule } from '../teachers/teachers.module';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

@Module({
  imports: [CoursesModule, TeachersModule, RoomsModule],
  controllers: [GroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
