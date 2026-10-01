import { Module } from '@nestjs/common';
import { TeacherScopeService } from './teacher-scope.service';
import { TeachersController } from './teachers.controller';
import { TeachersService } from './teachers.service';

@Module({
  controllers: [TeachersController],
  providers: [TeachersService, TeacherScopeService],
  exports: [TeachersService, TeacherScopeService],
})
export class TeachersModule {}
