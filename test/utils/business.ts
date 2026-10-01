import {
  type Api,
  createCourse,
  createFamily,
  createGroup,
  createLead,
  createStudent,
  createTeacher,
  enroll,
  type Tenant,
} from './academic';

/** "Today" as the organization sees it (default timezone Asia/Tashkent). */
export function orgToday(offsetDays = 0, timeZone = 'Asia/Tashkent'): string {
  const now = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
}

export interface Business {
  courseId: string;
  teacherId: string;
  groupId: string;
  familyId: string;
  studentIds: { ali: string; vali: string; converted: string };
  enrollmentIds: string[];
  invoiceId: string;
  paymentId: string;
  expenseId: string;
  leadId: string;
  employeeId: string;
  taskId: string;
}

/**
 * A small but complete month of activity in one branch, all dated today
 * (organization calendar): 3 students (one from a converted lead), one lesson
 * with PRESENT + ABSENT, a 500 000 invoice paid 300 000 by CARD, a 100 000 rent
 * expense, an employee with one assigned task.
 */
export async function seedBusiness(as: Api, tenant: Tenant, tag = 'A'): Promise<Business> {
  const branchId = tenant.termiz.id;
  const course = await createCourse(as, `C${tag}${Date.now().toString(36)}`);
  const teacher = await createTeacher(as, branchId, { firstName: `Teacher${tag}` });
  const group = await createGroup(as, { branchId, courseId: course.id, name: `Group ${tag}` });
  await as.patch(`/groups/${group.id}`).send({ teacherId: teacher.id }).expect(200);

  const family = await createFamily(as, branchId, `Family ${tag}`);
  const ali = await createStudent(as, family.id, branchId, 'Ali');
  const vali = await createStudent(as, family.id, branchId, 'Vali');
  const enrollments: { id: string }[] = [];
  for (const student of [ali, vali]) {
    const res = await enroll(as, student.id, group.id, '2026-09-01').expect(201);
    enrollments.push(res.body.data as { id: string });
  }
  await as
    .post(`/attendance/group/${group.id}`)
    .send({
      date: orgToday(),
      records: [
        { enrollmentId: enrollments[0].id, status: 'PRESENT' },
        { enrollmentId: enrollments[1].id, status: 'ABSENT' },
      ],
    })
    .expect(200);

  const invoice = await as
    .post('/invoices')
    .send({
      familyId: family.id,
      studentId: ali.id,
      amount: 500000,
      dueDate: orgToday(10),
      branchId,
    })
    .expect(201);
  const payment = await as
    .post('/payments')
    .send({ invoiceId: invoice.body.data.id as string, amount: 300000, method: 'CARD' })
    .expect(201);
  const expense = await as
    .post('/expenses')
    .send({ category: 'RENT', amount: 100000, paymentMethod: 'BANK_TRANSFER', branchId })
    .expect(201);

  const lead = await createLead(as, {
    branchId,
    name: `Lead ${tag}`,
    phone: `+99890${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
  });
  const conversion = await as
    .post(`/leads/${lead.id}/convert`)
    .send({ student: { firstName: 'Converted', lastName: tag } })
    .expect(201);

  const employee = await as
    .post('/employees')
    .send({ firstName: 'Emp', lastName: tag, phone: '+998901234567', primaryBranchId: branchId })
    .expect(201);
  const task = await as
    .post('/tasks')
    .send({ title: `Task ${tag}`, branchId, assignedToId: employee.body.data.id as string })
    .expect(201);

  return {
    courseId: course.id,
    teacherId: teacher.id,
    groupId: group.id,
    familyId: family.id,
    studentIds: {
      ali: ali.id,
      vali: vali.id,
      converted: (conversion.body.data as { student: { id: string } }).student.id,
    },
    enrollmentIds: enrollments.map((e) => e.id),
    invoiceId: invoice.body.data.id as string,
    paymentId: payment.body.data.id as string,
    expenseId: expense.body.data.id as string,
    leadId: lead.id,
    employeeId: employee.body.data.id as string,
    taskId: task.body.data.id as string,
  };
}
