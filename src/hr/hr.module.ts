import { Module } from '@nestjs/common';
import { DepartmentsController } from './departments/departments.controller';
import { DepartmentsService } from './departments/departments.service';
import { EmployeeBranchesService } from './employees/employee-branches.service';
import { EmployeesController } from './employees/employees.controller';
import { EmployeesService } from './employees/employees.service';
import { PositionsController } from './positions/positions.controller';
import { PositionsService } from './positions/positions.service';

@Module({
  controllers: [PositionsController, DepartmentsController, EmployeesController],
  providers: [PositionsService, DepartmentsService, EmployeesService, EmployeeBranchesService],
  exports: [EmployeesService],
})
export class HrModule {}
