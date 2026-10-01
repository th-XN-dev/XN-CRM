<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import FormField from '@/components/forms/FormField.vue';
import FormModal from '@/components/forms/FormModal.vue';
import MoneyInput from '@/components/forms/MoneyInput.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppTextarea from '@/components/ui/AppTextarea.vue';
import { useEntityForm } from '@/composables/useEntityForm';
import { zMoney, zOptionalText, zText } from '@/lib/validation';
import type { CourseResponseDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { coursesApi } from '../api';

const props = defineProps<{ course?: CourseResponseDto | null }>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ saved: [course: CourseResponseDto] }>();
const { t } = useI18n();
const editing = computed(() => !!props.course);

const schema = z.object({
  name: zText(120, 2),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => /^[A-Z0-9_-]{2,20}$/.test(value), () => ({ message: t('validation.code') })),
  monthlyPrice: zMoney(0),
  description: zOptionalText(1000),
});

const save = useApiMutation({
  fn: (values: z.output<typeof schema>) =>
    props.course ? coursesApi.update(props.course.id, values) : coursesApi.create(values),
  invalidates: [['courses'], ['groups']],
  success: () => (editing.value ? t('courses.saved') : t('courses.created')),
  onSuccess: (course) => {
    open.value = false;
    emit('saved', course);
  },
});
const { defineField, errors, onSubmit, formError, reset, isSubmitting } = useEntityForm({
  schema,
  initialValues: () => ({
    name: props.course?.name ?? '',
    code: props.course?.code ?? '',
    monthlyPrice: props.course ? String(Math.round(Number(props.course.monthlyPrice))) : '',
    description: props.course?.description ?? '',
  }),
  submit: (values) => save.mutateAsync(values),
  fieldCodes: { COURSE_CODE_TAKEN: 'code' },
});
const [name] = defineField('name');
const [code] = defineField('code');
const [monthlyPrice] = defineField('monthlyPrice');
const [description] = defineField('description');
watch(open, (value) => value && reset());
</script>

<template>
  <FormModal v-model:open="open" :title="editing ? $t('courses.edit') : $t('courses.new')" :loading="isSubmitting" :error="formError" @submit="onSubmit">
    <FormField v-slot="field" :label="$t('courses.name')" :error="errors.name">
      <AppInput :id="field.id" v-model="name" :placeholder="$t('courses.namePlaceholder')" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
    <div class="grid gap-4 sm:grid-cols-2">
      <FormField v-slot="field" :label="$t('common.code')" :hint="$t('courses.codeHint')" :error="errors.code">
        <AppInput :id="field.id" v-model="code" autocapitalize="characters" placeholder="ENG" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('courses.monthlyPrice')" :error="errors.monthlyPrice">
        <MoneyInput :id="field.id" v-model="monthlyPrice" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
    </div>
    <FormField v-slot="field" :label="$t('common.description')" optional :error="errors.description">
      <AppTextarea :id="field.id" v-model="description" :rows="3" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
  </FormModal>
</template>
