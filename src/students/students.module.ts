import { Module } from '@nestjs/common';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { FamiliesModule } from '../families/families.module';
import { TeachersModule } from '../teachers/teachers.module';
import { FamilyStudentsController } from './family-students.controller';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

@Module({
  imports: [FamiliesModule, EnrollmentsModule, TeachersModule],
  controllers: [StudentsController, FamilyStudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
