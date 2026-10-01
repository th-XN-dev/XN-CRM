<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import FormField from '@/components/forms/FormField.vue';
import FormModal from '@/components/forms/FormModal.vue';
import AppInput from '@/components/ui/AppInput.vue';
import { useEntityForm } from '@/composables/useEntityForm';
import { zOptionalHexColor, zOptionalSlug } from '@/features/centers/options';
import { zOptionalPhone, zOptionalText, zText } from '@/lib/validation';
import type { CreateSubCenterDto, SubCenterDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { subCentersApi } from '../api';

const props = defineProps<{ subCenter?: SubCenterDto | null }>();
const open = defineModel<boolean>('open', { default: false });
const { t } = useI18n();
const editing = computed(() => !!props.subCenter);

const schema = z.object({
  name: zText(160),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => /^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(v), () => ({ message: t('validation.code') })),
  slug: zOptionalSlug(),
  primaryColor: zOptionalHexColor(),
  phone: zOptionalPhone(),
  address: zOptionalText(500),
});
const save = useApiMutation({
  fn: (body: CreateSubCenterDto) => (props.subCenter ? subCentersApi.update(props.subCenter.id, body) : subCentersApi.create(body)),
  invalidates: [['sub-centers'], ['branches'], ['analytics']],
  success: () => (editing.value ? t('management.subCenters.saved') : t('management.subCenters.created')),
  onSuccess: () => {
    open.value = false;
  },
});
const { defineField, errors, onSubmit, formError, reset, isSubmitting } = useEntityForm({
  schema,
  initialValues: () => ({
    name: props.subCenter?.name ?? '',
    code: props.subCenter?.code ?? '',
    slug: props.subCenter?.slug ?? '',
    primaryColor: props.subCenter?.primaryColor ?? '',
    phone: props.subCenter?.phone ?? '',
    address: props.subCenter?.address ?? '',
  }),
  submit: (values) => save.mutateAsync(values),
  fieldCodes: { SUB_CENTER_CODE_TAKEN: 'code' },
});
const [name] = defineField('name');
const [code] = defineField('code');
const [slug] = defineField('slug');
const [primaryColor] = defineField('primaryColor');
const [phone] = defineField('phone');
const [address] = defineField('address');
watch(open, (value) => value && reset());
</script>

<template>
  <FormModal v-model:open="open" :title="editing ? $t('management.subCenters.edit') : $t('management.subCenters.new')" :loading="isSubmitting" :error="formError" @submit="onSubmit">
    <FormField v-slot="field" :label="$t('management.subCenters.name')" :error="errors.name">
      <AppInput :id="field.id" v-model="name" :placeholder="$t('management.subCenters.namePlaceholder')" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
    <div class="grid grid-cols-2 gap-4">
      <FormField v-slot="field" :label="$t('management.subCenters.code')" :error="errors.code">
        <AppInput :id="field.id" v-model="code" placeholder="KIDS" autocapitalize="characters" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('management.subCenters.slug')" :hint="$t('management.subCenters.slugHint')" :error="errors.slug" optional>
        <AppInput :id="field.id" v-model="slug" autocapitalize="none" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
    </div>
    <div class="grid gap-4 sm:grid-cols-2">
      <FormField v-slot="field" :label="$t('management.subCenters.color')" :error="errors.primaryColor" optional>
        <AppInput :id="field.id" v-model="primaryColor" placeholder="#38B266" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('management.subCenters.phone')" :error="errors.phone" optional>
        <AppInput :id="field.id" v-model="phone" type="tel" inputmode="tel" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
    </div>
    <FormField v-slot="field" :label="$t('management.subCenters.address')" :error="errors.address" optional>
      <AppInput :id="field.id" v-model="address" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
  </FormModal>
</template>
