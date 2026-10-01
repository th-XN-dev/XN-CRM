import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AttendanceModule } from './attendance/attendance.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { BranchesModule } from './branches/branches.module';
import { EventsModule } from './common/events/events.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { createValidationPipe } from './common/pipes/app-validation.pipe';
import { type EnvironmentVariables, validateEnv } from './config/env.validation';
import { buildLoggerOptions } from './config/logger.config';
import { buildThrottlerOptions } from './config/throttler.config';
import { PrismaModule } from './database/prisma.module';
import { ReportsModule } from './reports/reports.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { PlatformModule } from './platform/platform.module';
import { PlatformGuard } from './platform/platform.guard';
import { SubCentersModule } from './sub-centers/sub-centers.module';
import { ChecklistsModule } from './checklists/checklists.module';
import { CommunicationsModule } from './communications/communications.module';
import { CoursesModule } from './courses/courses.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { FamiliesModule } from './families/families.module';
import { FinanceModule } from './finance/finance.module';
import { GroupsModule } from './groups/groups.module';
import { HealthModule } from './health/health.module';
import { HrModule } from './hr/hr.module';
import { LeadsModule } from './leads/leads.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RoomsModule } from './rooms/rooms.module';
import { SchedulesModule } from './schedules/schedules.module';
import { StudentsModule } from './students/students.module';
import { TasksModule } from './tasks/tasks.module';
import { TeachersModule } from './teachers/teachers.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { PermissionsGuard } from './tenancy/guards/permissions.guard';
import { TenantGuard } from './tenancy/guards/tenant.guard';

type Config = ConfigService<EnvironmentVariables, true>;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: process.env.NODE_ENV === 'test' ? ['.env.test'] : ['.env'],
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (c: Config) => buildLoggerOptions(c),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (c: Config) => buildThrottlerOptions(c),
    }),
    PrismaModule,
    TenancyModule,
    AuthModule,
    OrganizationsModule,
    BranchesModule,
    EventsModule,
    FamiliesModule,
    StudentsModule,
    CoursesModule,
    GroupsModule,
    EnrollmentsModule,
    TeachersModule,
    RoomsModule,
    SchedulesModule,
    AttendanceModule,
    FinanceModule,
    LeadsModule,
    HrModule,
    TasksModule,
    NotificationsModule,
    HealthModule,
    AuditModule,
    ReportsModule,
    DashboardModule,
    AnalyticsModule,
    PlatformModule,
    SubCentersModule,
    ChecklistsModule,
    CommunicationsModule,
    // Future domain modules plug in here.
  ],
  providers: [
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    // Guards run in this order: rate limit → authentication → platform role (owner
    // routes) → tenant context → permissions (center routes).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useExisting: PlatformGuard },
    { provide: APP_GUARD, useExisting: TenantGuard },
    { provide: APP_GUARD, useExisting: PermissionsGuard },
  ],
})
export class AppModule {}
