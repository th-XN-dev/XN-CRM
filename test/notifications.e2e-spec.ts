import { randomUUID } from 'node:crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationChannel, NotificationType } from '@prisma/client';
import { DomainEventName } from '../src/common/events/domain-events';
import { ProviderRegistry } from '../src/notifications/delivery/provider-registry';
import { type MockProvider } from '../src/notifications/delivery/providers/mock.provider';
import { NotificationActivity } from '../src/notifications/handlers/notification-activity';
import { NotificationsService } from '../src/notifications/notifications.service';
import { NotificationScannerService } from '../src/notifications/scanner/notification-scanner.service';
import {
  type Api,
  createCourse,
  createFamily,
  createGroup,
  createStudent,
  enroll,
  memberOf,
  setupTenant,
  type Tenant,
} from './utils/academic';
import { type TestUser } from './utils/factories';
import { createTestApp, resetDatabase, type TestContext } from './utils/test-app';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  relatedType: string | null;
  relatedId: string | null;
  isRead: boolean;
  data: Record<string, string>;
}

interface Delivery {
  id: string;
  channel: string;
  status: string;
  attempts: number;
  errorMessage: string | null;
}

const WEBHOOK_SECRET = 'test-webhook-secret-123456';

describe('Notifications & Communication (e2e)', () => {
  let ctx: TestContext;
  let t: Tenant;
  let email: MockProvider;
  let manager: { user: TestUser; as: Api };

  beforeAll(async () => {
    ctx = await createTestApp();
    email = ctx.app.get(ProviderRegistry).get(NotificationChannel.EMAIL) as MockProvider;
  });
  beforeEach(async () => {
    await idle();
    await resetDatabase(ctx.prisma);
    email.reset();
    t = await setupTenant(ctx);
    manager = await memberOf(ctx, t, 'MANAGER', [t.termiz.id]);
  });
  afterAll(async () => {
    await idle();
    await ctx.app.close();
  });

  /** Waits for async event handlers and the in-process delivery queue. */
  const idle = () => ctx.app.get(NotificationActivity).idle();

  const inbox = async (as: Api, query = '') => {
    await idle();
    const res = await as.get(`/notifications${query}`).expect(200);
    return res.body.data as { items: Notification[]; meta: { total: number; totalPages: number } };
  };

  const deliveriesOf = async (notificationId: string) => {
    await idle();
    const res = await t.as
      .get(`/notification-deliveries?notificationId=${notificationId}`)
      .expect(200);
    return (res.body.data as { items: Delivery[] }).items;
  };

  const sendSystem = (userIds: string[], title = 'Diqqat') =>
    t.as.post('/notifications').send({ title, message: 'Ertaga dars yo‘q', userIds }).expect(201);

  /** Links `user` to an employee of the Termiz branch (tasks are assigned to employees). */
  async function employeeFor(user: TestUser) {
    const res = await t.as
      .post('/employees')
      .send({
        firstName: 'Xusanjon',
        lastName: 'Rahimova',
        phone: '+998901234567',
        primaryBranchId: t.termiz.id,
        userId: user.id,
      })
      .expect(201);
    return res.body.data as { id: string };
  }

  const assignTask = (employeeId: string, title = 'Ota-onaga qo‘ng‘iroq') =>
    t.as
      .post('/tasks')
      .send({ title, branchId: t.termiz.id, assignedToId: employeeId })
      .expect(201)
      .then((res) => res.body.data as { id: string });

  async function issueInvoice(dueDate = '2026-12-01') {
    const family = await createFamily(t.as, t.termiz.id);
    const student = await createStudent(t.as, family.id, t.termiz.id);
    const res = await t.as
      .post('/invoices')
      .send({
        familyId: family.id,
        studentId: student.id,
        amount: 500000,
        dueDate,
        branchId: t.termiz.id,
      })
      .expect(201);
    return res.body.data as { id: string; invoiceNumber: string };
  }

  // ─── in-app inbox ───────────────────────────────────────────────────────

  describe('inbox', () => {
    it('creates, lists, counts, reads and removes notifications', async () => {
      const sent = await sendSystem([manager.user.id], 'Birinchi');
      expect(sent.body.data).toEqual({ created: 1, duplicates: 0 });
      await sendSystem([manager.user.id], 'Ikkinchi');
      await sendSystem([manager.user.id], 'Uchinchi');

      const all = await inbox(manager.as);
      expect(all.meta.total).toBe(3);
      expect(all.items[0]).toMatchObject({ type: 'SYSTEM', title: 'Uchinchi', isRead: false });

      const count = await manager.as.get('/notifications/unread-count').expect(200);
      expect(count.body).toEqual({ success: true, data: { count: 3 } });

      const read = await manager.as.patch(`/notifications/${all.items[0].id}/read`).expect(200);
      expect(read.body.data.isRead).toBe(true);
      expect((await inbox(manager.as, '?isRead=true')).meta.total).toBe(1);
      const unread = await manager.as.get('/notifications/unread').expect(200);
      expect(unread.body.data.meta.total).toBe(2);

      const paged = await inbox(manager.as, '?type=SYSTEM&limit=2&page=2');
      expect(paged.meta).toMatchObject({ total: 3, totalPages: 2 });
      expect(paged.items).toHaveLength(1);

      const readAll = await manager.as.patch('/notifications/read-all').expect(200);
      expect(readAll.body.data).toEqual({ updated: 2 });
      const zero = await manager.as.get('/notifications/unread-count').expect(200);
      expect(zero.body.data.count).toBe(0);

      await manager.as.delete(`/notifications/${all.items[1].id}`).expect(200);
      expect((await inbox(manager.as)).meta.total).toBe(2);

      const deliveries = await manager.as
        .get(`/notifications/${all.items[0].id}/deliveries`)
        .expect(200);
      expect(deliveries.body.data).toEqual([
        expect.objectContaining({ channel: 'IN_APP', status: 'DELIVERED' }),
      ]);
    });

    it('isolates users and organizations', async () => {
      await sendSystem([manager.user.id]);
      const [mine] = (await inbox(manager.as)).items;

      // The owner can't see or touch the manager's notification.
      expect((await inbox(t.as)).meta.total).toBe(0);
      const foreign = await t.as.patch(`/notifications/${mine.id}/read`).expect(404);
      expect(foreign.body.code).toBe('NOTIFICATION_NOT_FOUND');
      await t.as.delete(`/notifications/${mine.id}`).expect(404);
      await t.as.get(`/notifications/${mine.id}/deliveries`).expect(404);

      const other = await setupTenant(ctx, 'Other Academy');
      await other.as.patch(`/notifications/${mine.id}/read`).expect(404);
      expect((await inbox(other.as)).meta.total).toBe(0);

      // Recipients must be members: a user of another organization is never notified.
      const outsider = await t.as
        .post('/notifications')
        .send({ title: 'X', message: 'Y', userIds: [other.owner.id] })
        .expect(400);
      expect(outsider.body.code).toBe('NOTIFICATION_NO_RECIPIENTS');
    });

    it('enforces notification permissions', async () => {
      const teacher = await memberOf(ctx, t, 'TEACHER', [t.termiz.id]);
      await teacher.as.get('/notifications').expect(200);
      await teacher.as.get('/notification-preferences').expect(200);
      await teacher.as.get('/notification-templates').expect(403);
      await manager.as.get('/notification-templates').expect(200);
      await manager.as
        .post('/notifications')
        .send({ title: 'X', message: 'Y', userIds: [teacher.user.id] })
        .expect(403);
      await manager.as.post('/notification-templates').send({}).expect(403);
      await manager.as.get('/notification-providers').expect(403);
      await manager.as.get('/notification-deliveries').expect(200);

      const providers = await t.as.get('/notification-providers').expect(200);
      expect(providers.body.data).toContainEqual({
        channel: 'EMAIL',
        configured: true,
        provider: 'mock-email',
      });
    });
  });

  // ─── preferences, policies, templates ─────────────────────────────────

  describe('configuration', () => {
    it('preferences choose channels; locked channels stay on', async () => {
      const prefs = await manager.as.get('/notification-preferences').expect(200);
      const system = (prefs.body.data as { type: string; lockedChannels: string[] }[]).find(
        (p) => p.type === 'SYSTEM',
      );
      expect(system).toMatchObject({ inAppEnabled: true, lockedChannels: ['IN_APP'] });

      const locked = await manager.as
        .patch('/notification-preferences')
        .send({ items: [{ type: 'SYSTEM', inAppEnabled: false }] })
        .expect(400);
      expect(locked.body.code).toBe('NOTIFICATION_CHANNEL_LOCKED');

      // Email only for task assignments: nothing in the inbox, one email out.
      const updated = await manager.as
        .patch('/notification-preferences')
        .send({ items: [{ type: 'TASK_ASSIGNED', inAppEnabled: false, emailEnabled: true }] })
        .expect(200);
      expect(
        (updated.body.data as { type: string }[]).find((p) => p.type === 'TASK_ASSIGNED'),
      ).toMatchObject({ inAppEnabled: false, emailEnabled: true, isCustomized: true });

      const employee = await employeeFor(manager.user);
      await assignTask(employee.id, 'Hisobot');
      expect((await inbox(manager.as)).meta.total).toBe(0);
      expect(email.sent).toHaveLength(1);
      expect(email.sent[0]).toMatchObject({
        to: manager.user.email,
        title: 'Yangi vazifa: Hisobot',
      });
    });

    it('policies: critical types stay on, others can be switched off', async () => {
      const critical = await t.as
        .patch('/notification-policies/SYSTEM')
        .send({ isEnabled: false })
        .expect(400);
      expect(critical.body.code).toBe('NOTIFICATION_TYPE_CRITICAL');
      await t.as
        .patch('/notification-policies/PAYMENT_RECEIVED')
        .send({ recipientPermission: 'nope.read' })
        .expect(400);

      await t.as
        .patch('/notification-policies/TASK_ASSIGNED')
        .send({ isEnabled: false })
        .expect(200);
      const employee = await employeeFor(manager.user);
      await assignTask(employee.id);
      expect((await inbox(manager.as)).meta.total).toBe(0);

      const policies = await t.as.get('/notification-policies').expect(200);
      expect(
        (policies.body.data as { type: string }[]).find((p) => p.type === 'TASK_ASSIGNED'),
      ).toMatchObject({ isEnabled: false, isCustomized: true });
    });

    it('templates: allow-listed variables only, organization text wins', async () => {
      const catalog = await t.as.get('/notification-templates/catalog').expect(200);
      expect(
        (catalog.body.data as { type: string; variables: string[] }[]).find(
          (c) => c.type === 'PAYMENT_RECEIVED',
        )?.variables,
      ).toEqual(expect.arrayContaining(['studentName', 'familyName', 'amount', 'dueDate']));

      const invalid = await t.as
        .post('/notification-templates')
        .send({
          type: 'PAYMENT_RECEIVED',
          channel: 'IN_APP',
          titleTemplate: '{{amount}} {{user.password}}',
          messageTemplate: '{{secret}}',
        })
        .expect(400);
      expect(invalid.body.code).toBe('NOTIFICATION_TEMPLATE_INVALID_VARIABLE');

      const created = await t.as
        .post('/notification-templates')
        .send({
          type: 'PAYMENT_RECEIVED',
          channel: 'IN_APP',
          titleTemplate: 'Kirim: {{amount}} so‘m',
          messageTemplate: '{{studentName}} uchun {{invoiceNumber}}',
        })
        .expect(201);
      await t.as
        .post('/notification-templates')
        .send({
          type: 'PAYMENT_RECEIVED',
          channel: 'IN_APP',
          titleTemplate: 'x',
          messageTemplate: 'y',
        })
        .expect(409);

      const invoice = await issueInvoice();
      await t.as.post('/payments').send({ invoiceId: invoice.id, amount: 250000, method: 'CARD' });
      const [notification] = (await inbox(manager.as)).items;
      expect(notification).toMatchObject({
        type: 'PAYMENT_RECEIVED',
        title: 'Kirim: 250 000 so‘m',
        message: `Ali Karimov uchun ${invoice.invoiceNumber}`,
      });

      await t.as
        .patch(`/notification-templates/${created.body.data.id}`)
        .send({ isActive: false })
        .expect(200);
      await t.as.delete(`/notification-templates/${created.body.data.id}`).expect(200);
      const list = await t.as.get('/notification-templates').expect(200);
      expect(list.body.data.meta.total).toBe(0);
    });
  });

  // ─── business events ──────────────────────────────────────────────────

  describe('business events', () => {
    it('task assigned → the assignee is notified (not the assigner)', async () => {
      const employee = await employeeFor(manager.user);
      const task = await assignTask(employee.id);

      const [notification] = (await inbox(manager.as)).items;
      expect(notification).toMatchObject({
        type: 'TASK_ASSIGNED',
        relatedType: 'Task',
        relatedId: task.id,
        title: 'Yangi vazifa: Ota-onaga qo‘ng‘iroq',
      });
      expect((await inbox(t.as)).meta.total).toBe(0);
    });

    it('payment received → finance watchers, once per payment (duplicate events ignored)', async () => {
      const cashier = await memberOf(ctx, t, 'CASHIER', [t.termiz.id]);
      const invoice = await issueInvoice();
      const payment = await cashier.as
        .post('/payments')
        .send({ invoiceId: invoice.id, amount: 250000, method: 'CARD' })
        .expect(201);
      const paymentId = payment.body.data.id as string;

      const [ownerNote] = (await inbox(t.as)).items;
      expect(ownerNote).toMatchObject({ type: 'PAYMENT_RECEIVED', relatedId: paymentId });
      expect(ownerNote.data).toMatchObject({
        amount: '250 000',
        invoiceNumber: invoice.invoiceNumber,
      });
      expect((await inbox(manager.as)).meta.total).toBe(1);
      expect((await inbox(cashier.as)).meta.total).toBe(0); // the actor

      // Replay the same business event twice: still one notification per recipient.
      const emitter = ctx.app.get(EventEmitter2);
      for (let i = 0; i < 2; i++) {
        emitter.emit(DomainEventName.PAYMENT_CREATED, {
          eventId: randomUUID(),
          name: DomainEventName.PAYMENT_CREATED,
          organizationId: t.orgId,
          actorUserId: cashier.user.id,
          entityType: 'Payment',
          entityId: paymentId,
          occurredAt: new Date(),
          payload: {},
        });
      }
      expect((await inbox(t.as)).meta.total).toBe(1);
      expect(await ctx.prisma.notification.count({ where: { relatedId: paymentId } })).toBe(2);
    });

    it('the same eventKey never notifies a recipient twice', async () => {
      const notifications = ctx.app.get(NotificationsService);
      const input = {
        organizationId: t.orgId,
        type: NotificationType.SYSTEM,
        eventKey: `SYSTEM:${randomUUID()}`,
        subjectUserIds: [manager.user.id],
        variables: { title: 'A', message: 'B' },
      };
      await expect(notifications.notify(input)).resolves.toEqual({ created: 1, duplicates: 0 });
      await expect(notifications.notify(input)).resolves.toEqual({ created: 0, duplicates: 1 });
      const [again] = await Promise.all([notifications.notify(input), notifications.notify(input)]);
      expect(again.created).toBe(0);
      expect((await inbox(manager.as)).meta.total).toBe(1);
    });

    it('attendance ABSENT / LATE → attendance watchers of the branch', async () => {
      const course = await createCourse(t.as, 'MATH');
      const family = await createFamily(t.as, t.termiz.id);
      const group = await createGroup(t.as, {
        branchId: t.termiz.id,
        courseId: course.id,
        name: 'Math-1',
      });
      const ali = await createStudent(t.as, family.id, t.termiz.id, 'Ali');
      const vali = await createStudent(t.as, family.id, t.termiz.id, 'Vali');
      const aliEnrollment = (await enroll(t.as, ali.id, group.id, '2026-09-01').expect(201)).body
        .data;
      const valiEnrollment = (await enroll(t.as, vali.id, group.id, '2026-09-01').expect(201)).body
        .data;

      const records = [
        { enrollmentId: aliEnrollment.id, status: 'ABSENT' },
        { enrollmentId: valiEnrollment.id, status: 'LATE' },
      ];
      await t.as
        .post(`/attendance/group/${group.id}`)
        .send({ date: '2026-09-07', records })
        .expect(200);
      // Re-saving the same sheet does not repeat the notifications.
      await t.as
        .post(`/attendance/group/${group.id}`)
        .send({ date: '2026-09-07', records })
        .expect(200);

      const items = (await inbox(manager.as)).items;
      expect(items.map((n) => n.type).sort()).toEqual(['ATTENDANCE_ABSENT', 'ATTENDANCE_LATE']);
      expect(items.find((n) => n.type === 'ATTENDANCE_ABSENT')).toMatchObject({
        relatedType: 'Student',
        relatedId: ali.id,
        data: expect.objectContaining({
          studentName: 'Ali Karimov',
          groupName: 'Math-1',
        }) as unknown,
      });
      // The marker (owner) is the actor and is not notified.
      expect((await inbox(t.as)).meta.total).toBe(0);
    });

    it('lead assigned → the assignee', async () => {
      const lead = await t.as
        .post('/leads')
        .send({
          name: 'Dilnoza',
          phone: '+998901112233',
          branchId: t.termiz.id,
          assignedToId: manager.user.id,
        })
        .expect(201);
      const [notification] = (await inbox(manager.as)).items;
      expect(notification).toMatchObject({
        type: 'LEAD_ASSIGNED',
        relatedType: 'Lead',
        relatedId: lead.body.data.id as string,
      });
    });
  });

  // ─── reminders ────────────────────────────────────────────────────────

  describe('scheduled reminders', () => {
    it('task due / overdue, payment due, lead follow-up — each once', async () => {
      const employee = await employeeFor(manager.user);
      const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
      await t.as
        .post('/tasks')
        .send({
          title: 'Soon',
          branchId: t.termiz.id,
          assignedToId: employee.id,
          dueDate: inHours(2),
        })
        .expect(201);
      await t.as
        .post('/tasks')
        .send({
          title: 'Late',
          branchId: t.termiz.id,
          assignedToId: employee.id,
          dueDate: inHours(-2),
        })
        .expect(201);
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      await issueInvoice(tomorrow);
      await t.as
        .post('/leads')
        .send({
          name: 'Follow me',
          phone: '+998907776655',
          branchId: t.termiz.id,
          assignedToId: manager.user.id,
          nextFollowUpAt: inHours(-1),
        })
        .expect(201);
      await idle();

      const scanner = ctx.app.get(NotificationScannerService);
      const first = await scanner.scan();
      expect(first.created).toBeGreaterThanOrEqual(4);
      const second = await scanner.scan();
      expect(second.created).toBe(0);

      const types = (await inbox(manager.as, '?limit=100')).items.map((n) => n.type);
      expect(types).toEqual(
        expect.arrayContaining(['TASK_DUE', 'TASK_OVERDUE', 'PAYMENT_DUE', 'LEAD_FOLLOW_UP']),
      );
      expect(types.filter((type) => type === 'TASK_DUE')).toHaveLength(1);
    });
  });

  // ─── external delivery ────────────────────────────────────────────────

  describe('delivery', () => {
    beforeEach(async () => {
      await manager.as
        .patch('/notification-preferences')
        .send({ items: [{ type: 'SYSTEM', emailEnabled: true }] })
        .expect(200);
    });

    const emailDelivery = async () => {
      const [notification] = (await inbox(manager.as)).items;
      return (await deliveriesOf(notification.id)).find((d) => d.channel === 'EMAIL')!;
    };

    it('retries a failing provider and records the history', async () => {
      email.failNext(2, 'SMTP timeout');
      await sendSystem([manager.user.id]);
      expect(await emailDelivery()).toMatchObject({
        status: 'SENT',
        attempts: 3,
        errorMessage: null,
      });
      expect(email.sent).toHaveLength(1);
    });

    it('gives up after the configured attempts; an admin can retry', async () => {
      email.failNext(Infinity, 'SMTP down');
      await sendSystem([manager.user.id]);
      const failed = await emailDelivery();
      expect(failed).toMatchObject({ status: 'FAILED', attempts: 3, errorMessage: 'SMTP down' });

      email.reset();
      await t.as.post(`/notification-deliveries/${failed.id}/retry`).expect(201);
      expect(await emailDelivery()).toMatchObject({ status: 'SENT', attempts: 1 });
      const again = await t.as.post(`/notification-deliveries/${failed.id}/retry`).expect(409);
      expect(again.body.code).toBe('NOTIFICATION_DELIVERY_NOT_RETRYABLE');

      const history = await t.as
        .get('/notification-deliveries?channel=EMAIL&status=SENT')
        .expect(200);
      expect(history.body.data.meta.total).toBe(1);
    });
  });

  // ─── Telegram ─────────────────────────────────────────────────────────

  describe('telegram linking', () => {
    const webhook = (text: string, fromId: number, secret = WEBHOOK_SECRET) =>
      ctx
        .http()
        .post('/telegram/webhook')
        .set('X-Telegram-Bot-Api-Secret-Token', secret)
        .send({
          update_id: 1,
          message: { text, from: { id: fromId, username: 'Xusanjon' }, chat: { id: fromId } },
        });

    it('links with a one-time code sent to the bot', async () => {
      const code = await manager.as.post('/telegram/link-code').expect(201);
      const { code: value, deepLink } = code.body.data as { code: string; deepLink: string };
      expect(deepLink).toBe(`https://t.me/xn_crm_test_bot?start=${value}`);

      await webhook(`/start ${value}`, 5_000_000_001, 'wrong-secret-wrong-secret').expect(403);
      const linked = await webhook(`/start ${value}`, 5_000_000_001).expect(200);
      expect(linked.body.data).toEqual({ ok: true, linked: true });

      const account = await manager.as.get('/telegram/account').expect(200);
      expect(account.body.data).toMatchObject({
        telegramUserId: '5000000001',
        chatId: '5000000001',
        isVerified: true,
      });

      const reused = await webhook(`/start ${value}`, 5_000_000_001).expect(200);
      expect(reused.body.data).toMatchObject({
        linked: false,
        reason: 'TELEGRAM_LINK_CODE_INVALID',
      });

      // The same Telegram account can't be linked to another CRM user.
      const otherCode = await t.as.post('/telegram/link-code').expect(201);
      const taken = await webhook(`/start ${otherCode.body.data.code as string}`, 5_000_000_001);
      expect(taken.body.data).toMatchObject({ linked: false, reason: 'TELEGRAM_ACCOUNT_TAKEN' });

      await manager.as.delete('/telegram/account').expect(200);
      await manager.as.delete('/telegram/account').expect(404);
      await ctx.http().post('/telegram/link-code').expect(401);
    });
  });
});
