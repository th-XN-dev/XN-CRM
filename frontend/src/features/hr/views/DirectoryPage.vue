<script setup lang="ts">
import { Pencil, Plus, Power } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import { P } from '@/app/config/permissions';
import DataTable, { type DataColumn } from '@/components/data/DataTable.vue';
import FilterSelect from '@/components/data/FilterSelect.vue';
import ListPage from '@/components/data/ListPage.vue';
import ListToolbar from '@/components/data/ListToolbar.vue';
import StatusBadge from '@/components/data/StatusBadge.vue';
import FormField from '@/components/forms/FormField.vue';
import FormModal from '@/components/forms/FormModal.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import { useEntityForm } from '@/composables/useEntityForm';
import { usePermission } from '@/composables/usePermission';
import { zOptionalText, zText } from '@/lib/validation';
import type { DirectoryItemResponseDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { useListState } from '@/services/query/useListState';
import { type DirectoryKind, hrApi, useDirectory } from '../api';

/** Positions or departments: a small list with inline create/edit/deactivate. */
const props = defineProps<{ kind: DirectoryKind }>();
const { t } = useI18n();
const { can } = usePermission();
const manage = computed(() => can(props.kind === 'positions' ? P.POSITIONS_MANAGE : P.DEPARTMENTS_MANAGE));
const list = useListState({ page: 1, search: '', isActive: 'true' });
const items = useDirectory(() => props.kind, () => ({ ...list.params.value, limit: 50 }));
const formOpen = ref(false);
const edited = ref<DirectoryItemResponseDto | null>(null);
const columns = computed<DataColumn[]>(() => [
  { key: 'name', label: t('common.name') },
  { key: 'code', label: t('common.code') },
  { key: 'description', label: t('common.description'), wide: true },
  { key: 'employeeCount', label: t('hr.employeesCount'), align: 'right' },
  { key: 'isActive', label: t('common.status') },
]);
const statusOptions = computed(() => [
  { value: 'true', label: t('status.active.true') },
  { value: 'false', label: t('status.active.false') },
]);
const codeTaken = computed(() => (props.kind === 'positions' ? 'POSITION_CODE_TAKEN' : 'DEPARTMENT_CODE_TAKEN'));

const schema = z.object({
  name: zText(120),
  code: z.string().trim().toUpperCase().refine((v) => /^[A-Z0-9_-]{2,30}$/.test(v), () => ({ message: t('validation.code') })),
  description: zOptionalText(500),
});
const save = useApiMutation({
  fn: (values: z.output<typeof schema>) =>
    edited.value ? hrApi.updateItem(props.kind, edited.value.id, values) : hrApi.createItem(props.kind, values),
  invalidates: [['hr'], ['employees']],
  success: () => t('hr.itemSaved'),
  onSuccess: () => {
    formOpen.value = false;
  },
});
const toggle = useApiMutation({
  fn: (item: DirectoryItemResponseDto) => (item.isActive ? hrApi.deactivateItem(props.kind, item.id) : hrApi.updateItem(props.kind, item.id, { isActive: true })),
  invalidates: [['hr']],
  toastError: true,
});
const form = useEntityForm({
  schema,
  initialValues: () => ({ name: edited.value?.name ?? '', code: edited.value?.code ?? '', description: edited.value?.description ?? '' }),
  submit: (values) => save.mutateAsync(values),
  fieldCodes: { [codeTaken.value]: 'code' },
});
const [name] = form.defineField('name');
const [code] = form.defineField('code');
const [description] = form.defineField('description');
function open(item: DirectoryItemResponseDto | null): void {
  edited.value = item;
  formOpen.value = true;
}
watch(formOpen, (value) => value && form.reset());
</script>

<template>
  <div>
    <ListToolbar :search="list.state.search" :search-label="$t(`hr.searchItems.${kind}`)" :active-filters="list.activeFilters.value" @update:search="list.set({ search: $event })" @reset="list.reset()">
      <template #filters>
        <FilterSelect :model-value="list.state.isActive" :label="$t('common.status')" :options="statusOptions" @update:model-value="list.set({ isActive: $event })" />
      </template>
      <template #actions>
        <AppButton v-if="manage" :icon="Plus" @click="open(null)">{{ $t(`hr.newItem.${kind}`) }}</AppButton>
      </template>
    </ListToolbar>
    <ListPage
      :loading="items.isPending.value"
      :error="items.error.value"
      :meta="items.data.value?.meta"
      :page="list.state.page"
      :empty-title="$t(`hr.emptyItems.${kind}`)"
      @update:page="list.set({ page: $event })"
      @retry="items.refetch()"
    >
      <DataTable :columns="columns" :rows="items.data.value?.items ?? []" :row-key="(row: DirectoryItemResponseDto) => row.id" :caption="$t(`hr.sections.${kind}`)" :loading="items.isFetching.value">
        <template #cell-isActive="{ row }"><StatusBadge kind="active" :value="row.isActive" /></template>
        <template #mobile="{ row }">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="truncate font-medium text-fg">{{ row.name }} <span class="text-sm font-normal text-fg-muted">{{ row.code }}</span></p>
              <p class="text-sm text-fg-muted">{{ $t('hr.peopleCount', { count: row.employeeCount }, row.employeeCount) }}</p>
            </div>
            <StatusBadge v-if="!row.isActive" kind="active" :value="false" />
          </div>
        </template>
        <template v-if="manage" #actions="{ row }">
          <AppButton variant="ghost" size="sm" icon-only :icon="Pencil" :label="$t('common.edit')" @click="open(row)" />
          <AppButton variant="ghost" size="sm" icon-only :icon="Power" :label="row.isActive ? $t('common.deactivate') : $t('common.activate')" @click="toggle.mutate(row)" />
        </template>
      </DataTable>
    </ListPage>
    <FormModal v-model:open="formOpen" :title="edited ? $t('common.edit') : $t(`hr.newItem.${kind}`)" :loading="form.isSubmitting.value" :error="form.formError.value" size="sm" @submit="form.onSubmit">
      <FormField v-slot="field" :label="$t('common.name')" :error="form.errors.value.name">
        <AppInput :id="field.id" v-model="name" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('common.code')" :error="form.errors.value.code">
        <AppInput :id="field.id" v-model="code" autocapitalize="characters" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('common.description')" optional :error="form.errors.value.description">
        <AppInput :id="field.id" v-model="description" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
    </FormModal>
  </div>
</template>
