<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import { P } from '@/app/config/permissions';
import FormField from '@/components/forms/FormField.vue';
import FormModal from '@/components/forms/FormModal.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import { useEntityForm } from '@/composables/useEntityForm';
import { usePermission } from '@/composables/usePermission';
import { useSubCenters } from '@/features/sub-centers/api';
import { zOptionalPhone, zOptionalText, zText } from '@/lib/validation';
import { useApiMutation } from '@/services/query/useApiQuery';
import { useSessionStore } from '@/stores/session.store';
import { type BranchDto, branchesApi } from '../api';

/** Create or edit a branch; it may sit in a sub-center or directly under the center. */
const props = defineProps<{ branch?: BranchDto | null; subCenterId?: string | null }>();
const open = defineModel<boolean>('open', { default: false });
const { t } = useI18n();
const { can } = usePermission();
const session = useSessionStore();
const editing = computed(() => !!props.branch);
const subCenters = useSubCenters(() => can(P.SUB_CENTERS_READ));
const subCenterOptions = computed(() => [{ value: '', label: t('management.branches.none') }, ...subCenters.options.value]);

const schema = z.object({
  name: zText(160),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => /^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(v), () => ({ message: t('validation.code') })),
  phone: zOptionalPhone(),
  address: zOptionalText(500),
  subCenterId: z.string(),
});
const save = useApiMutation({
  fn: (values: z.output<typeof schema>) =>
    props.branch
      ? branchesApi.update(props.branch.id, { ...values, subCenterId: values.subCenterId || null })
      : branchesApi.create(session.organizationId ?? '', { ...values, subCenterId: values.subCenterId || undefined }),
  invalidates: [['branches'], ['sub-centers'], ['analytics']],
  success: () => (editing.value ? t('management.branches.saved') : t('management.branches.created')),
  onSuccess: async () => {
    open.value = false;
    // New/renamed branches appear in the branch switcher.
    await session.reloadContext();
  },
});
const { defineField, errors, onSubmit, formError, reset, isSubmitting } = useEntityForm({
  schema,
  initialValues: () => ({
    name: props.branch?.name ?? '',
    code: props.branch?.code ?? '',
    phone: props.branch?.phone ?? '',
    address: props.branch?.address ?? '',
    subCenterId: props.branch?.subCenterId ?? props.subCenterId ?? '',
  }),
  submit: (values) => save.mutateAsync(values),
  fieldCodes: { BRANCH_CODE_TAKEN: 'code', SUB_CENTER_NOT_FOUND: 'subCenterId', SUB_CENTER_INACTIVE: 'subCenterId' },
});
const [name] = defineField('name');
const [code] = defineField('code');
const [phone] = defineField('phone');
const [address] = defineField('address');
const [subCenterField] = defineField('subCenterId');
watch(open, (value) => value && reset());
</script>

<template>
  <FormModal v-model:open="open" :title="editing ? $t('management.branches.edit') : $t('management.branches.new')" :loading="isSubmitting" :error="formError" @submit="onSubmit">
    <FormField v-slot="field" :label="$t('management.branches.name')" :error="errors.name">
      <AppInput :id="field.id" v-model="name" :placeholder="$t('management.branches.namePlaceholder')" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
    <div class="grid grid-cols-2 gap-4">
      <FormField v-slot="field" :label="$t('management.branches.code')" :error="errors.code">
        <AppInput :id="field.id" v-model="code" placeholder="TRM" autocapitalize="characters" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('management.branches.phone')" :error="errors.phone" optional>
        <AppInput :id="field.id" v-model="phone" type="tel" inputmode="tel" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
    </div>
    <FormField v-slot="field" :label="$t('management.branches.address')" :error="errors.address" optional>
      <AppInput :id="field.id" v-model="address" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
    <FormField v-if="subCenters.options.value.length" v-slot="field" :label="$t('management.branches.subCenter')" :error="errors.subCenterId">
      <AppSelect :id="field.id" v-model="subCenterField" :options="subCenterOptions" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
  </FormModal>
</template>
