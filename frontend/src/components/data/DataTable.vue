<script setup lang="ts" generic="Row extends object">
import { useLocalStorage } from '@vueuse/core';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Columns3 } from 'lucide-vue-next';
import { computed } from 'vue';
import { RouterLink, useRouter, type RouteLocationRaw } from 'vue-router';
import AppButton from '@/components/ui/AppButton.vue';
import AppDropdown from '@/components/ui/AppDropdown.vue';
import AppSkeleton from '@/components/ui/AppSkeleton.vue';

export interface DataColumn {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  /** The API can sort by this column (`sortBy` = key unless `sortKey` is given). */
  sortable?: boolean;
  sortKey?: string;
  /** Hidden below the `lg` breakpoint on the desktop table (secondary information). */
  wide?: boolean;
}

export interface SortState {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

/**
 * The CRM list: a real table from `md` up (sortable headers, row links, row
 * actions), compact cards on phones (`#mobile` slot) — never a squeezed table.
 * Cells are customised with `#cell-<key>`; values default to `row[key]`.
 */
const props = defineProps<{
  columns: readonly DataColumn[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  caption: string;
  loading?: boolean;
  sort?: SortState;
  /** Makes rows open a page: the first cell becomes a link, the row clickable. */
  rowTo?: (row: Row) => RouteLocationRaw;
  /** Enables "Columns" (show/hide, remembered on this device under this id). The first column always stays. */
  columnsId?: string;
  /** Adds row checkboxes (v-model:selected = row keys) for bulk actions. */
  selectable?: boolean;
  /** Accessible name of a row's checkbox ("Select: <name>"). */
  rowLabel?: (row: Row) => string;
}>();
const selected = defineModel<string[]>('selected', { default: () => [] });
const emit = defineEmits<{ sort: [sort: SortState] }>();
defineSlots<
  {
    mobile?: (props: { row: Row }) => unknown;
    actions?: (props: { row: Row }) => unknown;
  } & Record<`cell-${string}`, (props: { row: Row; value: unknown }) => unknown>
>();
const router = useRouter();
const hidden = useLocalStorage<string[]>(`xn.table.${props.columnsId ?? 'default'}.hidden`, []);
const visibleColumns = computed(() =>
  props.columnsId ? props.columns.filter((column, index) => index === 0 || !hidden.value.includes(column.key)) : props.columns,
);
function toggleColumn(key: string, visible: boolean): void {
  hidden.value = visible ? hidden.value.filter((k) => k !== key) : [...hidden.value, key];
}

const pageKeys = computed(() => props.rows.map((row) => props.rowKey(row)));
const allSelected = computed(() => pageKeys.value.length > 0 && pageKeys.value.every((key) => selected.value.includes(key)));
const someSelected = computed(() => !allSelected.value && pageKeys.value.some((key) => selected.value.includes(key)));
function toggleAll(on: boolean): void {
  selected.value = on
    ? [...new Set([...selected.value, ...pageKeys.value])]
    : selected.value.filter((key) => !pageKeys.value.includes(key));
}
function toggleRow(row: Row, on: boolean): void {
  const key = props.rowKey(row);
  selected.value = on ? [...new Set([...selected.value, key])] : selected.value.filter((k) => k !== key);
}
const checkboxClass = 'size-5 cursor-pointer rounded-md border-border-strong accent-(--primary) focus-visible:ring-4 focus-visible:ring-ring';

const alignClass = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;
const cell = (row: Row, key: string): unknown => (row as Record<string, unknown>)[key];

function sortKeyOf(column: DataColumn): string {
  return column.sortKey ?? column.key;
}

function toggleSort(column: DataColumn): void {
  const key = sortKeyOf(column);
  const current = props.sort;
  const sortOrder = current?.sortBy === key && current.sortOrder === 'asc' ? 'desc' : 'asc';
  emit('sort', { sortBy: key, sortOrder });
}

function ariaSort(column: DataColumn): 'ascending' | 'descending' | 'none' | undefined {
  if (!column.sortable) return undefined;
  if (props.sort?.sortBy !== sortKeyOf(column)) return 'none';
  return props.sort.sortOrder === 'asc' ? 'ascending' : 'descending';
}

function onRowClick(row: Row, event: MouseEvent): void {
  if (!props.rowTo) return;
  // Clicks on buttons/links inside the row keep their own behavior; selecting text is not a click.
  if ((event.target as HTMLElement).closest('a, button, input, select, label')) return;
  if (window.getSelection()?.toString()) return;
  void router.push(props.rowTo(row));
}
</script>

<template>
  <div>
    <!-- Desktop / tablet -->
    <div v-if="columnsId" class="hidden justify-end px-3 pt-2 md:flex">
      <AppDropdown :label="$t('table.columns')" width="w-56">
        <template #trigger="{ toggle, open, menuId }">
          <AppButton variant="ghost" size="sm" :icon="Columns3" :aria-expanded="open" :aria-controls="menuId" aria-haspopup="menu" @click="toggle">
            {{ $t('table.columns') }}
          </AppButton>
        </template>
        <button
          v-for="column in columns.slice(1)"
          :key="column.key"
          type="button"
          role="menuitemcheckbox"
          tabindex="-1"
          :aria-checked="!hidden.includes(column.key)"
          class="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-fg outline-none hover:bg-surface-hover focus-visible:bg-surface-hover"
          @click="toggleColumn(column.key, hidden.includes(column.key))"
        >
          <span
            class="inline-flex size-4.5 items-center justify-center rounded border"
            :class="hidden.includes(column.key) ? 'border-border-strong' : 'border-primary bg-primary text-primary-fg'"
            aria-hidden="true"
          ><Check v-if="!hidden.includes(column.key)" class="size-3.5" /></span>
          {{ column.label }}
        </button>
      </AppDropdown>
    </div>
    <div class="hidden overflow-x-auto md:block">
      <table class="w-full border-separate border-spacing-0 text-sm">
        <caption class="sr-only">{{ caption }}</caption>
        <thead class="sticky top-0 z-10 bg-surface">
          <tr>
            <th v-if="selectable" scope="col" class="w-px border-b border-border py-3 pr-1 pl-4">
              <input
                type="checkbox"
                :class="checkboxClass"
                :checked="allSelected"
                :indeterminate="someSelected"
                :aria-label="$t('table.selectAll')"
                @change="toggleAll(($event.target as HTMLInputElement).checked)"
              />
            </th>
            <th
              v-for="column in visibleColumns"
              :key="column.key"
              scope="col"
              :aria-sort="ariaSort(column)"
              class="border-b border-border px-4 py-3 text-xs font-semibold tracking-wide whitespace-nowrap text-fg-muted uppercase"
              :class="[alignClass[column.align ?? 'left'], column.wide && 'hidden lg:table-cell']"
            >
              <button
                v-if="column.sortable"
                type="button"
                class="focus-ring -mx-1 inline-flex items-center gap-1 rounded-md px-1 uppercase hover:text-fg"
                @click="toggleSort(column)"
              >
                {{ column.label }}
                <ArrowUp v-if="ariaSort(column) === 'ascending'" class="size-3.5" aria-hidden="true" />
                <ArrowDown v-else-if="ariaSort(column) === 'descending'" class="size-3.5" aria-hidden="true" />
                <ArrowUpDown v-else class="size-3.5 opacity-40" aria-hidden="true" />
              </button>
              <template v-else>{{ column.label }}</template>
            </th>
            <th v-if="$slots.actions" scope="col" class="w-px border-b border-border px-4 py-3">
              <span class="sr-only">{{ $t('common.actions') }}</span>
            </th>
          </tr>
        </thead>
        <tbody v-if="loading && rows.length === 0">
          <tr v-for="n in 6" :key="n" aria-hidden="true">
            <td v-if="selectable" class="border-b border-border" />
            <td v-for="column in visibleColumns" :key="column.key" class="border-b border-border px-4 py-4" :class="column.wide && 'hidden lg:table-cell'">
              <AppSkeleton :class="n % 2 ? 'w-3/4' : 'w-1/2'" />
            </td>
            <td v-if="$slots.actions" class="border-b border-border" />
          </tr>
        </tbody>
        <tbody v-else :class="loading && 'opacity-60 transition-opacity'" :aria-busy="loading || undefined">
          <tr
            v-for="row in rows"
            :key="rowKey(row)"
            class="transition-colors hover:bg-surface-hover"
            :class="[rowTo && 'cursor-pointer', selectable && selected.includes(rowKey(row)) && 'bg-primary-soft/50']"
            @click="onRowClick(row, $event)"
          >
            <td v-if="selectable" class="border-b border-border py-3 pr-1 pl-4">
              <input
                type="checkbox"
                :class="checkboxClass"
                :checked="selected.includes(rowKey(row))"
                :aria-label="$t('table.selectRow', { name: rowLabel?.(row) ?? rowKey(row) })"
                @change="toggleRow(row, ($event.target as HTMLInputElement).checked)"
              />
            </td>
            <td
              v-for="(column, index) in visibleColumns"
              :key="column.key"
              class="border-b border-border px-4 py-3 text-fg"
              :class="[alignClass[column.align ?? 'left'], column.wide && 'hidden lg:table-cell', column.align === 'right' && 'tabular-nums']"
            >
              <RouterLink
                v-if="rowTo && index === 0"
                :to="rowTo(row)"
                class="focus-ring rounded font-medium text-fg hover:text-primary-text"
              >
                <slot :name="`cell-${column.key}`" :row="row" :value="cell(row, column.key)">{{ cell(row, column.key) }}</slot>
              </RouterLink>
              <slot v-else :name="`cell-${column.key}`" :row="row" :value="cell(row, column.key)">{{ cell(row, column.key) ?? '—' }}</slot>
            </td>
            <td v-if="$slots.actions" class="border-b border-border px-2 py-1 text-right whitespace-nowrap">
              <slot name="actions" :row="row" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Phone: compact cards -->
    <ul class="flex flex-col gap-2 md:hidden" :aria-label="caption" :aria-busy="loading || undefined">
      <template v-if="loading && rows.length === 0">
        <li v-for="n in 4" :key="n"><AppSkeleton shape="block" class="h-20" /></li>
      </template>
      <li v-for="row in rows" :key="rowKey(row)" class="relative rounded-2xl border border-border bg-surface shadow-card">
        <component
          :is="rowTo ? RouterLink : 'div'"
          :to="rowTo?.(row)"
          class="focus-ring block rounded-2xl p-4"
          :class="rowTo && 'active:bg-surface-hover'"
        >
          <slot name="mobile" :row="row">
            <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <template v-for="column in columns" :key="column.key">
                <dt class="text-fg-muted">{{ column.label }}</dt>
                <dd class="text-right text-fg">
                  <slot :name="`cell-${column.key}`" :row="row" :value="cell(row, column.key)">{{ cell(row, column.key) ?? '—' }}</slot>
                </dd>
              </template>
            </dl>
          </slot>
        </component>
        <div v-if="$slots.actions || selectable" class="flex items-center justify-end gap-1 border-t border-border px-2 py-1">
          <label v-if="selectable" class="mr-auto inline-flex min-h-11 cursor-pointer items-center gap-2 px-2 text-sm text-fg-muted">
            <input
              type="checkbox"
              :class="checkboxClass"
              :checked="selected.includes(rowKey(row))"
              :aria-label="$t('table.selectRow', { name: rowLabel?.(row) ?? rowKey(row) })"
              @change="toggleRow(row, ($event.target as HTMLInputElement).checked)"
            />
            <span aria-hidden="true">{{ $t('table.select') }}</span>
          </label>
          <slot name="actions" :row="row" />
        </div>
      </li>
    </ul>
  </div>
</template>
