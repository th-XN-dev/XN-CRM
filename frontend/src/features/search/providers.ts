import { CheckSquare, GraduationCap, House, Magnet, UserRound, UsersRound } from 'lucide-vue-next';
import type { Component } from 'vue';
import type { RouteLocationRaw } from 'vue-router';
import { P, type PermissionRequirement } from '@/app/config/permissions';
import { fullName } from '@/lib/people';
import { api } from '@/services/api/http';
import type {
  EmployeeResponseDto,
  FamilyListItemDto,
  GroupResponseDto,
  LeadListItemDto,
  StudentListItemDto,
  TaskResponseDto,
} from '@/services/api/schema.gen';
import type { Paginated } from '@/types/api';

export interface SearchResult {
  id: string;
  title: string;
  subtitle?: string;
  to: RouteLocationRaw;
}

/**
 * One searchable section. Adding a new one (e.g. invoices) = one entry here;
 * the palette runs every provider the member may use, in parallel.
 */
export interface SearchProvider {
  key: string;
  icon: Component;
  permission: PermissionRequirement;
  search: (term: string, signal: AbortSignal) => Promise<SearchResult[]>;
}

const LIMIT = 5;
const list = <T>(url: string, term: string, signal: AbortSignal, params: Record<string, unknown> = {}) =>
  api.get<Paginated<T>>(url, { params: { search: term, limit: LIMIT, ...params }, signal }).then((page) => page.items);

export const searchProviders: readonly SearchProvider[] = [
  {
    key: 'students',
    icon: GraduationCap,
    permission: [P.STUDENTS_READ, P.STUDENTS_READ_OWN],
    search: async (term, signal) =>
      (await list<StudentListItemDto>('/students', term, signal)).map((s) => ({
        id: s.id,
        title: fullName(s),
        subtitle: [s.family.name, s.phone].filter(Boolean).join(' · '),
        to: { name: 'student', params: { id: s.id } },
      })),
  },
  {
    key: 'families',
    icon: House,
    permission: P.FAMILIES_READ,
    search: async (term, signal) =>
      (await list<FamilyListItemDto>('/families', term, signal)).map((f) => ({
        id: f.id,
        title: f.name,
        subtitle: f.phone,
        to: { name: 'family', params: { id: f.id } },
      })),
  },
  {
    key: 'groups',
    icon: UsersRound,
    permission: [P.GROUPS_READ, P.GROUPS_READ_OWN],
    search: async (term, signal) =>
      (await list<GroupResponseDto>('/groups', term, signal)).map((g) => ({
        id: g.id,
        title: g.name,
        subtitle: [g.course.name, g.teacher ? fullName(g.teacher) : null].filter(Boolean).join(' · '),
        to: { name: 'group', params: { id: g.id } },
      })),
  },
  {
    key: 'leads',
    icon: Magnet,
    permission: P.LEADS_READ,
    search: async (term, signal) =>
      (await list<LeadListItemDto>('/leads', term, signal)).map((l) => ({
        id: l.id,
        title: l.name,
        subtitle: l.phone,
        to: { name: 'lead', params: { id: l.id } },
      })),
  },
  {
    key: 'employees',
    icon: UserRound,
    permission: P.EMPLOYEES_READ,
    search: async (term, signal) =>
      (await list<EmployeeResponseDto>('/employees', term, signal)).map((e) => ({
        id: e.id,
        title: fullName(e),
        subtitle: [e.position?.name, e.phone].filter(Boolean).join(' · '),
        to: { name: 'employee', params: { id: e.id } },
      })),
  },
  {
    key: 'tasks',
    icon: CheckSquare,
    permission: [P.TASKS_READ, P.TASKS_READ_OWN],
    search: async (term, signal) =>
      (await list<TaskResponseDto>('/tasks', term, signal)).map((task) => ({
        id: task.id,
        title: task.title,
        subtitle: task.assignedTo ? fullName(task.assignedTo) : undefined,
        to: { name: 'task', params: { id: task.id } },
      })),
  },
];
