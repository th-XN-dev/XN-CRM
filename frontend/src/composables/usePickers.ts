import { useI18n } from 'vue-i18n';
import type { PickerOption } from '@/components/forms/EntityPicker.vue';
import { fullName } from '@/lib/people';
import { api } from '@/services/api/http';
import type {
  EmployeeResponseDto,
  FamilyListItemDto,
  GroupResponseDto,
  InvoiceListItemDto,
  StudentListItemDto,
} from '@/services/api/schema.gen';
import type { Paginated } from '@/types/api';
import { useFormatters } from './useFormatters';

const LIMIT = 20;

/**
 * Search functions for <EntityPicker>. Each option carries the facts needed to
 * choose correctly (phone, course, free seats, remaining debt…).
 */
export function usePickers() {
  const { t } = useI18n();
  const format = useFormatters();

  async function families(search: string): Promise<PickerOption[]> {
    const page = await api.get<Paginated<FamilyListItemDto>>('/families', {
      params: { search: search || undefined, isActive: true, limit: LIMIT, sortBy: 'name', sortOrder: 'asc' },
    });
    return page.items.map((family) => ({
      value: family.id,
      label: family.name,
      description: `${family.phone} · ${t('families.studentsCount', { count: family.studentsCount }, family.studentsCount)}`,
    }));
  }

  function students(filter: { familyId?: string; status?: string } = {}) {
    return async (search: string): Promise<PickerOption[]> => {
      const page = await api.get<Paginated<StudentListItemDto>>('/students', {
        params: { search: search || undefined, limit: LIMIT, sortBy: 'lastName', sortOrder: 'asc', ...filter },
      });
      return page.items.map((student) => ({
        value: student.id,
        label: fullName(student),
        description: [student.family.name, student.phone].filter(Boolean).join(' · '),
      }));
    };
  }

  /** Running groups; full ones are listed but disabled with the reason. */
  function groups(filter: { excludeId?: string; branchId?: string } = {}) {
    return async (search: string): Promise<PickerOption[]> => {
      const page = await api.get<Paginated<GroupResponseDto>>('/groups', {
        params: {
          search: search || undefined,
          status: 'ACTIVE',
          branchId: filter.branchId,
          limit: LIMIT,
          sortBy: 'name',
          sortOrder: 'asc',
        },
      });
      return page.items
        .filter((group) => group.id !== filter.excludeId)
        .map((group) => {
          const full = group.enrolledCount >= group.capacity;
          return {
            value: group.id,
            label: group.name,
            disabled: full,
            description: [
              group.course.name,
              group.teacher ? fullName(group.teacher) : null,
              full ? t('groups.full') : t('groups.seats', { used: group.enrolledCount, total: group.capacity }),
            ]
              .filter(Boolean)
              .join(' · '),
          };
        });
    };
  }

  /** Unpaid invoices (optionally of one family), with what is still owed. */
  function openInvoices(filter: { familyId?: string } = {}) {
    return async (search: string): Promise<PickerOption[]> => {
      // Overdue first (collect those), then unpaid and partly paid — the API splits them by status.
      const pages = await Promise.all(
        [{ overdue: true }, { status: 'PENDING' }, { status: 'PARTIAL' }].map((filterBy) =>
          api.get<Paginated<InvoiceListItemDto>>('/invoices', {
            params: {
              search: search || undefined,
              familyId: filter.familyId,
              limit: LIMIT,
              sortBy: 'dueDate',
              sortOrder: 'asc',
              ...filterBy,
            },
          }),
        ),
      );
      const seen = new Set<string>();
      return pages
        .flatMap((page) => page.items)
        .filter((invoice) => !seen.has(invoice.id) && seen.add(invoice.id))
        .map((invoice) => ({
          value: invoice.id,
          label: `${invoice.invoiceNumber} · ${invoice.family.name}`,
          description: [
            invoice.student ? fullName(invoice.student) : null,
            t('finance.debtLeft', { amount: format.money(invoice.debt) }),
            t('finance.dueOn', { date: format.day(invoice.dueDate) }),
          ]
            .filter(Boolean)
            .join(' · '),
        }));
    };
  }

  function employees(filter: { branchId?: string } = {}) {
    return async (search: string): Promise<PickerOption[]> => {
      const page = await api.get<Paginated<EmployeeResponseDto>>('/employees', {
        params: { search: search || undefined, status: 'ACTIVE', branchId: filter.branchId, limit: LIMIT, sortBy: 'lastName', sortOrder: 'asc' },
      });
      return page.items.map((employee) => ({
        value: employee.id,
        label: fullName(employee),
        description: [employee.position?.name, employee.phone].filter(Boolean).join(' · '),
      }));
    };
  }

  return { families, students, groups, openInvoices, employees };
}
