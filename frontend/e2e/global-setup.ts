import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = process.env.E2E_API_URL ?? 'http://localhost:3100/api/v1';
const PASSWORD = 'correct-horse-battery';
const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURES = resolve(here, '.fixtures.json');

async function call<T>(method: string, path: string, body?: unknown, token?: string, organizationId?: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(organizationId && { 'X-Organization-Id': organizationId }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await response.json()) as { success: boolean; data: T; message?: string };
  if (!json.success) throw new Error(`${method} ${path} → ${response.status} ${json.message}`);
  return json.data;
}

async function register(name: string) {
  const email = `${name.toLowerCase().replace(/\s+/g, '.')}.${randomUUID().slice(0, 8)}@e2e.xn.uz`;
  const auth = await call<{ user: { id: string }; tokens: { accessToken: string } }>('POST', '/auth/register', {
    name,
    email,
    password: PASSWORD,
  });
  return { id: auth.user.id, email, token: auth.tokens.accessToken };
}

function sql(statement: string): void {
  execFileSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'xn_crm', '-d', 'xn_crm', '-v', 'ON_ERROR_STOP=1', '-c', statement], {
    cwd: resolve(here, '../..'),
    env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ''}` },
    stdio: 'pipe',
  });
}

/** Adds a member with a system role (direct SQL on the dev database, like a seed). */
function addMember(userId: string, organizationId: string, role: string, branchIds: string[]): void {
  const statement = `
    WITH m AS (
      INSERT INTO organization_memberships (id, user_id, organization_id, role_id, status, all_branches, created_at, updated_at)
      SELECT gen_random_uuid(), '${userId}', '${organizationId}', id, 'ACTIVE', false, now(), now()
      FROM roles WHERE key = '${role}' AND organization_id IS NULL
      RETURNING id
    )
    INSERT INTO branch_memberships (id, membership_id, branch_id, organization_id, created_at)
    SELECT gen_random_uuid(), m.id, b, '${organizationId}', now() FROM m, unnest(ARRAY[${branchIds
      .map((b) => `'${b}'::uuid`)
      .join(',')}]) AS b;`;
  sql(statement);
}

export default async function globalSetup(): Promise<void> {
  const owner = await register('Xusanjon Baxromov');
  const jony = await call<{ id: string }>('POST', '/organizations', { name: `Jony Math Academy ${randomUUID().slice(0, 4)}` }, owner.token);
  await call('PATCH', `/organizations/${jony.id}`, { primaryColor: '#38B266' }, owner.token);
  const termiz = await call<{ id: string }>('POST', `/organizations/${jony.id}/branches`, { name: 'Termiz', code: 'TRM' }, owner.token);

  // Academic setup in Termiz: a course, a teacher, a room and a group with a lesson today.
  const as = <T>(method: string, path: string, body?: unknown) => call<T>(method, path, body, owner.token, jony.id);
  const tag = randomUUID().slice(0, 4).toUpperCase();
  const course = await as<{ id: string }>('POST', '/courses', { name: 'English', code: `EN${tag}`, monthlyPrice: 450000 });
  const teacher = await as<{ id: string }>('POST', '/teachers', { branchId: termiz.id, firstName: 'Dilnoza', lastName: 'Rahimova' });
  // A second group taught by someone else: the teacher must not see it.
  const otherTeacher = await as<{ id: string }>('POST', '/teachers', { branchId: termiz.id, firstName: 'Sardor', lastName: 'Aliyev' });
  const room = await as<{ id: string }>('POST', '/rooms', { branchId: termiz.id, name: 'Room 101', code: `R${tag}`, capacity: 16 });
  const groupName = `English A1 ${tag}`;
  const group = await as<{ id: string }>('POST', '/groups', {
    branchId: termiz.id,
    courseId: course.id,
    name: groupName,
    capacity: 12,
    startDate: '2026-01-10',
    teacherId: teacher.id,
    roomId: room.id,
  });
  await as('POST', '/groups', {
    branchId: termiz.id,
    courseId: course.id,
    name: `Math B2 ${tag}`,
    capacity: 10,
    startDate: '2026-01-10',
    teacherId: otherTeacher.id,
  });
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'Asia/Tashkent' }).format(new Date()).toUpperCase();
  await as('POST', `/groups/${group.id}/schedules`, { dayOfWeek: weekday, startTime: '09:00', endTime: '10:30' });
  await call('POST', `/organizations/${jony.id}/branches`, { name: 'Denov', code: 'DNV' }, owner.token);
  const abc = await call<{ id: string }>('POST', '/organizations', { name: `ABC Education ${randomUUID().slice(0, 4)}` }, owner.token);
  await call('POST', `/organizations/${abc.id}/branches`, { name: 'Sherobod', code: 'SHR' }, owner.token);

  // One organization, one branch, cashier role: no selectors, a reduced menu.
  const cashier = await register('Bekzod Toshev');
  addMember(cashier.id, jony.id, 'CASHIER', [termiz.id]);
  const manager = await register('Malika Yusupova');
  addMember(manager.id, jony.id, 'MANAGER', [termiz.id]);
  // The teacher signs in as the teacher profile of the first group.
  const teacherUser = await register('Dilnoza Rahimova');
  addMember(teacherUser.id, jony.id, 'TEACHER', [termiz.id]);
  await as('PATCH', `/teachers/${teacher.id}`, { userId: teacherUser.id });

  // The XN CRM platform owner (owner area); promoted the way `npm run platform:owner` does.
  const platformOwner = await register('Platform Owner');
  sql(`UPDATE users SET platform_role = 'OWNER' WHERE id = '${platformOwner.id}'`);

  mkdirSync(here, { recursive: true });
  writeFileSync(
    FIXTURES,
    JSON.stringify(
      { password: PASSWORD, owner: owner.email, platformOwner: platformOwner.email, cashier: cashier.email, manager: manager.email, teacher: teacherUser.email, jonyId: jony.id, groupName, tag },
      null,
      2,
    ),
  );
}
