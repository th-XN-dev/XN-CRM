import { Module } from '@nestjs/common';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { LevelsController } from './levels.controller';
import { LevelsService } from './levels.service';

@Module({
  controllers: [CoursesController, LevelsController],
  providers: [CoursesService, LevelsService],
  exports: [CoursesService, LevelsService],
})
export class CoursesModule {}
