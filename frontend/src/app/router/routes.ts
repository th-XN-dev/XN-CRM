import type { RouteComponent, RouteMeta, RouteRecordRaw } from 'vue-router';

type LazyComponent = () => Promise<RouteComponent | { default: RouteComponent }>;
import { P } from '@/app/config/permissions';

const AppShell = () => import('@/components/layout/AppShell.vue');
const FeaturePage = () => import('@/features/shared/FeaturePage.vue');

/** A list page and its record page (`:id` passed as a prop). */
const page = (
  path: string,
  name: string,
  component: LazyComponent,
  titleKey: string,
  permission?: RouteMeta['permission'],
): RouteRecordRaw => ({ path, name, component, props: path.includes(':id'), meta: { titleKey, permission } });

const settingsSection = (
  path: string,
  key: string,
  component: LazyComponent,
  permission?: Pick<RouteMeta, 'permission'>,
): RouteRecordRaw => ({
  path,
  name: `settings-${path}`,
  component,
  meta: { titleKey: `settings.sections.${key}`, ...permission },
});

const ProfilePage = () => import('@/features/profile/views/ProfilePage.vue');

export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/features/auth/LoginPage.vue'),
    meta: { public: true, titleKey: 'auth.submit' },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/features/auth/RegisterPage.vue'),
    meta: { public: true, titleKey: 'auth.createAccount' },
  },
  {
    path: '/change-password',
    name: 'change-password',
    component: () => import('@/features/auth/ChangePasswordPage.vue'),
    meta: { stage: 'account', titleKey: 'account.firstLogin.title' },
  },
  {
    // The platform owner's area: its own shell, no center context.
    path: '/owner',
    component: () => import('@/features/owner/OwnerShell.vue'),
    meta: { platform: true },
    children: [
      { path: '', name: 'owner-dashboard', component: () => import('@/features/owner/views/OwnerDashboardPage.vue'), meta: { titleKey: 'owner.dashboard.title' } },
      { path: 'centers', name: 'owner-centers', component: () => import('@/features/centers/views/CentersPage.vue'), meta: { titleKey: 'owner.centers.title' } },
      { path: 'centers/new', name: 'owner-center-new', component: () => import('@/features/centers/views/CenterCreatePage.vue'), meta: { titleKey: 'owner.wizard.title' } },
      { path: 'centers/:id', name: 'owner-center', component: () => import('@/features/centers/views/CenterPage.vue'), props: true, meta: { titleKey: 'owner.centers.title' } },
      { path: 'directors', name: 'owner-directors', component: () => import('@/features/directors/views/DirectorsPage.vue'), meta: { titleKey: 'owner.directors.title' } },
      { path: 'analytics', name: 'owner-analytics', component: () => import('@/features/analytics/views/GlobalAnalyticsPage.vue'), meta: { titleKey: 'owner.analytics.title' } },
      { path: 'platform', name: 'owner-platform', component: () => import('@/features/owner/views/PlatformPage.vue'), meta: { titleKey: 'owner.platform.title' } },
      { path: 'profile', name: 'owner-profile', component: ProfilePage, meta: { titleKey: 'account.profile.title' } },
    ],
  },
  {
    path: '/select-organization',
    name: 'select-organization',
    component: () => import('@/features/organizations/SelectOrganizationPage.vue'),
    meta: { stage: 'organization', titleKey: 'onboarding.selectOrganization' },
  },
  {
    path: '/select-branch',
    name: 'select-branch',
    component: () => import('@/features/branches/SelectBranchPage.vue'),
    meta: { stage: 'branch', titleKey: 'onboarding.selectBranch' },
  },
  {
    path: '/',
    component: AppShell,
    children: [
      {
        path: '',
        name: 'dashboard',
        component: () => import('@/features/dashboard/DashboardPage.vue'),
        meta: { titleKey: 'nav.dashboard', permission: P.DASHBOARD_READ },
      },
      page('center', 'center', () => import('@/features/center/views/CenterPage.vue'), 'management.center.title', P.ORGANIZATION_READ),
      page('sub-centers', 'sub-centers', () => import('@/features/sub-centers/views/SubCentersPage.vue'), 'management.subCenters.title', P.SUB_CENTERS_READ),
      page('branches', 'branches', () => import('@/features/branches/views/BranchesPage.vue'), 'management.branches.title', P.BRANCH_READ),
      page('analytics', 'analytics', () => import('@/features/analytics/views/CenterAnalyticsPage.vue'), 'management.analytics.title', P.ANALYTICS_CENTER_READ),
      { path: 'profile', name: 'profile', component: ProfilePage, meta: { titleKey: 'account.profile.title' } },
      page('families', 'families', () => import('@/features/families/views/FamiliesPage.vue'), 'nav.families', P.FAMILIES_READ),
      page('families/:id', 'family', () => import('@/features/families/views/FamilyPage.vue'), 'nav.families', P.FAMILIES_READ),
      page('students', 'students', () => import('@/features/students/views/StudentsPage.vue'), 'nav.students', [P.STUDENTS_READ, P.STUDENTS_READ_OWN]),
      page('students/:id', 'student', () => import('@/features/students/views/StudentPage.vue'), 'nav.students', [P.STUDENTS_READ, P.STUDENTS_READ_OWN]),
      page('courses', 'courses', () => import('@/features/courses/views/CoursesPage.vue'), 'nav.courses', P.COURSES_READ),
      page('courses/:id', 'course', () => import('@/features/courses/views/CoursePage.vue'), 'nav.courses', P.COURSES_READ),
      page('groups', 'groups', () => import('@/features/groups/views/GroupsPage.vue'), 'nav.groups', [P.GROUPS_READ, P.GROUPS_READ_OWN]),
      page('groups/:id', 'group', () => import('@/features/groups/views/GroupPage.vue'), 'nav.groups', [P.GROUPS_READ, P.GROUPS_READ_OWN]),
      page('teachers', 'teachers', () => import('@/features/teachers/views/TeachersPage.vue'), 'nav.teachers', P.TEACHERS_READ),
      page('teachers/:id', 'teacher', () => import('@/features/teachers/views/TeacherPage.vue'), 'nav.teachers', P.TEACHERS_READ),
      page('rooms', 'rooms', () => import('@/features/rooms/views/RoomsPage.vue'), 'nav.rooms', P.ROOMS_READ),
      page('schedule', 'schedule', () => import('@/features/schedule/views/SchedulePage.vue'), 'nav.schedule', [P.GROUPS_READ, P.GROUPS_READ_OWN]),
      page('attendance', 'attendance', () => import('@/features/attendance/views/AttendancePage.vue'), 'nav.attendance', [P.ATTENDANCE_READ, P.ATTENDANCE_READ_OWN]),
      {
        path: 'finance',
        component: () => import('@/features/finance/views/FinanceLayout.vue'),
        meta: { titleKey: 'nav.finance', permission: P.FINANCE_READ },
        children: [
          page('', 'finance', () => import('@/features/finance/views/FinanceOverviewPage.vue'), 'nav.finance'),
          page('invoices', 'finance-invoices', () => import('@/features/finance/views/InvoicesPage.vue'), 'finance.sections.invoices'),
          page('invoices/:id', 'invoice', () => import('@/features/finance/views/InvoicePage.vue'), 'finance.sections.invoices'),
          page('payments', 'finance-payments', () => import('@/features/finance/views/PaymentsPage.vue'), 'finance.sections.payments', P.FINANCE_PAYMENT_READ),
          page('debtors', 'finance-debtors', () => import('@/features/finance/views/DebtorsPage.vue'), 'finance.sections.debtors'),
          page('cash', 'finance-cash', () => import('@/features/finance/views/CashPage.vue'), 'finance.sections.cash', P.FINANCE_CASH_READ),
          page('expenses', 'finance-expenses', () => import('@/features/finance/views/ExpensesPage.vue'), 'finance.sections.expenses', P.FINANCE_EXPENSE_READ),
          page('refunds', 'finance-refunds', () => import('@/features/finance/views/RefundsPage.vue'), 'finance.sections.refunds', P.FINANCE_PAYMENT_READ),
        ],
      },
      page('leads', 'leads', () => import('@/features/leads/views/LeadsPage.vue'), 'nav.leads', P.LEADS_READ),
      page('leads/:id', 'lead', () => import('@/features/leads/views/LeadPage.vue'), 'nav.leads', P.LEADS_READ),
      {
        path: 'hr',
        component: () => import('@/features/hr/views/HrLayout.vue'),
        meta: { titleKey: 'nav.hr' },
        children: [
          { path: '', redirect: { name: 'hr-employees' } },
          page('employees', 'hr-employees', () => import('@/features/hr/views/EmployeesPage.vue'), 'hr.sections.employees', P.EMPLOYEES_READ),
          page('employees/:id', 'employee', () => import('@/features/hr/views/EmployeePage.vue'), 'hr.sections.employees', P.EMPLOYEES_READ),
          {
            path: 'positions',
            name: 'hr-positions',
            component: () => import('@/features/hr/views/DirectoryPage.vue'),
            props: { kind: 'positions' },
            meta: { titleKey: 'hr.sections.positions', permission: P.POSITIONS_READ },
          },
          {
            path: 'departments',
            name: 'hr-departments',
            component: () => import('@/features/hr/views/DirectoryPage.vue'),
            props: { kind: 'departments' },
            meta: { titleKey: 'hr.sections.departments', permission: P.DEPARTMENTS_READ },
          },
        ],
      },
      page('tasks', 'tasks', () => import('@/features/tasks/views/TasksPage.vue'), 'nav.tasks', [P.TASKS_READ, P.TASKS_READ_OWN]),
      page('tasks/:id', 'task', () => import('@/features/tasks/views/TaskPage.vue'), 'nav.tasks', [P.TASKS_READ, P.TASKS_READ_OWN]),
      page('notifications', 'notifications', () => import('@/features/notifications/views/NotificationsPage.vue'), 'nav.notifications', P.NOTIFICATIONS_READ),
      {
        // Reports are the next phase; routing and access are final.
        path: 'reports',
        name: 'reports',
        component: FeaturePage,
        props: { featureKey: 'reports' },
        meta: { titleKey: 'nav.reports', permission: [P.FINANCE_REPORT_READ, P.REPORTS_ACADEMIC_READ, P.LEADS_REPORT_READ] },
      },
      {
        path: 'settings',
        component: () => import('@/features/settings/SettingsLayout.vue'),
        meta: { titleKey: 'nav.settings' },
        children: [
          { path: '', name: 'settings', component: () => import('@/features/settings/SettingsIndex.vue') },
          settingsSection('appearance', 'appearance', () => import('@/features/settings/AppearanceSettings.vue')),
          settingsSection('language', 'language', () => import('@/features/settings/LanguageSettings.vue')),
          settingsSection('brand', 'brand', () => import('@/features/settings/BrandSettings.vue')),
          // The center profile and its branches have their own pages (Management menu).
          { path: 'organization', redirect: { name: 'center' } },
          { path: 'branches', redirect: { name: 'branches' } },
          settingsSection('users', 'users', () => import('@/features/staff/views/StaffPage.vue'), { permission: P.USERS_READ }),
          settingsSection('roles', 'roles', () => import('@/features/staff/views/RolesPage.vue'), { permission: P.USERS_READ }),
          settingsSection('notifications', 'notifications', () => import('@/features/settings/NotificationSettings.vue'), {
            permission: P.NOTIFICATION_PREFERENCES_READ,
          }),
        ],
      },
      {
        path: 'forbidden',
        name: 'forbidden',
        component: () => import('@/features/shared/ForbiddenPage.vue'),
        meta: { titleKey: 'states.forbiddenTitle' },
      },
      {
        path: ':pathMatch(.*)*',
        name: 'not-found',
        component: () => import('@/features/shared/NotFoundPage.vue'),
        meta: { titleKey: 'states.notFoundTitle' },
      },
    ],
  },
];
