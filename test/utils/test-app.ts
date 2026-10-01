import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { type App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { API_PREFIX, configureApp } from '../../src/app.setup';
import { PrismaService } from '../../src/database/prisma.service';
import { BackgroundTasks } from '../../src/common/events/background-tasks';
import { NotificationActivity } from '../../src/notifications/handlers/notification-activity';

type Agent = ReturnType<typeof request>;
export type Http = Pick<Agent, 'get' | 'post' | 'put' | 'patch' | 'delete'>;

export interface TestContext {
  app: INestApplication<App>;
  prisma: PrismaService;
  /** supertest agent whose paths are relative to `/api/v1` (except `/health`). */
  http: () => Http;
}

/** `/auth/login` → `/api/v1/auth/login`; `/health` stays at the root. */
export const apiPath = (url: string): string =>
  url === '/health' || url.startsWith('/health?') ? url : `/${API_PREFIX}${url}`;

function prefixed(server: App): Http {
  const agent = request(server);
  return {
    get: (url: string) => agent.get(apiPath(url)),
    post: (url: string) => agent.post(apiPath(url)),
    put: (url: string) => agent.put(apiPath(url)),
    patch: (url: string) => agent.patch(apiPath(url)),
    delete: (url: string) => agent.delete(apiPath(url)),
  };
}

export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({ logger: false });
  configureApp(app);
  // Listen once on an explicit IPv4 loopback port. Left to itself, supertest binds
  // `::` on a random port per request but connects to 127.0.0.1 — on macOS that
  // port can belong to another local process, which then answers the request.
  await app.listen(0, '127.0.0.1');

  // Event handlers (notifications) run after the response; let them finish
  // before the database is wiped or the app is closed, so no write races a test.
  const prisma = app.get(PrismaService);
  const activity = app.get(NotificationActivity);
  const background = app.get(BackgroundTasks);
  const settle = async () => {
    await activity.idle();
    await background.idle();
  };
  settlers.set(prisma, settle);
  const close = app.close.bind(app);
  app.close = async () => {
    await settle();
    return close();
  };
  return { app, prisma, http: () => prefixed(app.getHttpServer()) };
}

const settlers = new WeakMap<PrismaService, () => Promise<void>>();

/** Removes tenant/user data but keeps the seeded system roles and permissions. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await settlers.get(prisma)?.();
  await prisma.$transaction([
    // audit_logs is append-only (row DELETE is rejected by a trigger); TRUNCATE is statement-level.
    prisma.$executeRaw`TRUNCATE TABLE "audit_logs"`,
    prisma.notificationDelivery.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.notificationPreference.deleteMany(),
    prisma.notificationTemplate.deleteMany(),
    prisma.notificationPolicy.deleteMany(),
    prisma.telegramLinkToken.deleteMany(),
    prisma.userTelegramAccount.deleteMany(),
    prisma.checklistItem.deleteMany(),
    prisma.checklistTemplate.deleteMany(),
    prisma.dashboardLayout.deleteMany(),
    prisma.taskComment.deleteMany(),
    prisma.taskActivity.deleteMany(),
    prisma.task.deleteMany(),
    prisma.employeeBranch.deleteMany(),
    prisma.employee.deleteMany(),
    prisma.position.deleteMany(),
    prisma.department.deleteMany(),
    prisma.leadActivity.deleteMany(),
    prisma.lead.deleteMany(),
    prisma.leadStage.deleteMany(),
    prisma.leadPipeline.deleteMany(),
    prisma.leadSource.deleteMany(),
    prisma.refund.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.expense.deleteMany(),
    prisma.cashSession.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.documentCounter.deleteMany(),
    prisma.attendance.deleteMany(),
    prisma.schedule.deleteMany(),
    prisma.enrollment.deleteMany(),
    prisma.student.deleteMany(),
    prisma.family.deleteMany(),
    prisma.group.deleteMany(),
    prisma.teacher.deleteMany(),
    prisma.room.deleteMany(),
    prisma.level.deleteMany(),
    prisma.course.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.branchMembership.deleteMany(),
    prisma.organizationMembership.deleteMany(),
    prisma.branch.deleteMany(),
    prisma.subCenter.deleteMany(),
    prisma.role.deleteMany({ where: { organizationId: { not: null } } }),
    prisma.organization.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}
