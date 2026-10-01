import { Module } from '@nestjs/common';
import { FamiliesModule } from '../families/families.module';
import { StudentsModule } from '../students/students.module';
import { CashSessionsController } from './cash-sessions/cash-sessions.controller';
import { CashSessionsService } from './cash-sessions/cash-sessions.service';
import { DebtorsController } from './debtors/debtors.controller';
import { DebtorsService } from './debtors/debtors.service';
import { ExpensesController } from './expenses/expenses.controller';
import { ExpensesService } from './expenses/expenses.service';
import { InvoicesController } from './invoices/invoices.controller';
import { InvoicesService } from './invoices/invoices.service';
import { PaymentsController, RefundsController } from './payments/payments.controller';
import { PaymentsService } from './payments/payments.service';

@Module({
  imports: [FamiliesModule, StudentsModule],
  controllers: [
    InvoicesController,
    PaymentsController,
    RefundsController,
    CashSessionsController,
    ExpensesController,
    DebtorsController,
  ],
  providers: [
    InvoicesService,
    PaymentsService,
    CashSessionsService,
    ExpensesService,
    DebtorsService,
  ],
  exports: [InvoicesService],
})
export class FinanceModule {}
