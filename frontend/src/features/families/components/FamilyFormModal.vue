<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import FormField from '@/components/forms/FormField.vue';
import FormModal from '@/components/forms/FormModal.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppTextarea from '@/components/ui/AppTextarea.vue';
import { useEntityForm } from '@/composables/useEntityForm';
import { useBranchOptions } from '@/composables/useBranchOptions';
import { zOptionalEmail, zOptionalId, zOptionalPhone, zOptionalText, zPhone, zText } from '@/lib/validation';
import type { FamilyResponseDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { familiesApi } from '../api';

/** Create or edit a family (the payer and contact of one or more students). */
const props = defineProps<{ family?: FamilyResponseDto | null }>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ saved: [family: FamilyResponseDto] }>();
const { t } = useI18n();
const branches = useBranchOptions();
const editing = computed(() => !!props.family);

const schema = z.object({
  name: zText(160, 2),
  phone: zPhone(),
  secondaryPhone: zOptionalPhone(),
  email: zOptionalEmail(),
  address: zOptionalText(500),
  notes: zOptionalText(2000),
  primaryBranchId: zOptionalId(),
});

const save = useApiMutation({
  fn: (values: z.output<typeof schema>) =>
    props.family ? familiesApi.update(props.family.id, values) : familiesApi.create(values),
  invalidates: [['families'], ['students'], ['dashboard']],
  success: () => (editing.value ? t('families.saved') : t('families.created')),
  onSuccess: (family) => {
    open.value = false;
    emit('saved', family);
  },
});

const { defineField, errors, onSubmit, formError, reset, isSubmitting } = useEntityForm({
  schema,
  initialValues: () => ({
    name: props.family?.name ?? '',
    phone: props.family?.phone ?? '',
    secondaryPhone: props.family?.secondaryPhone ?? '',
    email: props.family?.email ?? '',
    address: props.family?.address ?? '',
    notes: props.family?.notes ?? '',
    primaryBranchId: props.family?.primaryBranchId ?? branches.defaultId.value,
  }),
  submit: (values) => save.mutateAsync(values),
});
const [name] = defineField('name');
const [phone] = defineField('phone');
const [secondaryPhone] = defineField('secondaryPhone');
const [email] = defineField('email');
const [address] = defineField('address');
const [notes] = defineField('notes');
const [primaryBranchId] = defineField('primaryBranchId');

watch(open, (value) => value && reset());
</script>

<template>
  <FormModal
    v-model:open="open"
    :title="editing ? $t('families.edit') : $t('families.new')"
    :loading="isSubmitting"
    :error="formError"
    @submit="onSubmit"
  >
    <FormField v-slot="field" :label="$t('families.name')" :hint="$t('families.nameHint')" :error="errors.name">
      <AppInput :id="field.id" v-model="name" :invalid="field.invalid" :described-by="field.describedBy" autocomplete="off" />
    </FormField>
    <div class="grid gap-4 sm:grid-cols-2">
      <FormField v-slot="field" :label="$t('common.phone')" :error="errors.phone">
        <AppInput :id="field.id" v-model="phone" type="tel" inputmode="tel" placeholder="+998 90 123 45 67" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('families.secondaryPhone')" optional :error="errors.secondaryPhone">
        <AppInput :id="field.id" v-model="secondaryPhone" type="tel" inputmode="tel" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
    </div>
    <FormField v-if="branches.options.value.length > 1" v-slot="field" :label="$t('common.branch')" :error="errors.primaryBranchId">
      <AppSelect :id="field.id" v-model="primaryBranchId" :options="branches.options.value" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
    <FormField v-slot="field" :label="$t('common.email')" optional :error="errors.email">
      <AppInput :id="field.id" v-model="email" type="email" inputmode="email" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
    <FormField v-slot="field" :label="$t('common.address')" optional :error="errors.address">
      <AppInput :id="field.id" v-model="address" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
    <FormField v-slot="field" :label="$t('common.notes')" optional :error="errors.notes">
      <AppTextarea :id="field.id" v-model="notes" :rows="3" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
  </FormModal>
</template>
