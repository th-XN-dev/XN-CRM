<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import FormField from '@/components/forms/FormField.vue';
import FormModal from '@/components/forms/FormModal.vue';
import AppInput from '@/components/ui/AppInput.vue';
import { useEntityForm } from '@/composables/useEntityForm';
import { zOptionalText, zText } from '@/lib/validation';
import type { LevelResponseDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { coursesApi } from '../api';

/** A level inside a course (Beginner → Elementary → …). New levels go to the end. */
const props = defineProps<{ courseId: string; level?: LevelResponseDto | null; nextOrder: number }>();
const open = defineModel<boolean>('open', { default: false });
const { t } = useI18n();
const editing = computed(() => !!props.level);

const schema = z.object({
  name: zText(120),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => /^[A-Z0-9_-]{1,20}$/.test(value), () => ({ message: t('validation.code') })),
  description: zOptionalText(1000),
});
const save = useApiMutation({
  fn: (values: z.output<typeof schema>) =>
    props.level
      ? coursesApi.updateLevel(props.level.id, values)
      : coursesApi.createLevel(props.courseId, { ...values, order: props.nextOrder }),
  invalidates: [['courses'], ['groups']],
  success: () => (editing.value ? t('courses.levelSaved') : t('courses.levelCreated')),
  onSuccess: () => {
    open.value = false;
  },
});
const { defineField, errors, onSubmit, formError, reset, isSubmitting } = useEntityForm({
  schema,
  initialValues: () => ({ name: props.level?.name ?? '', code: props.level?.code ?? '', description: props.level?.description ?? '' }),
  submit: (values) => save.mutateAsync(values),
  fieldCodes: { LEVEL_CODE_TAKEN: 'code' },
});
const [name] = defineField('name');
const [code] = defineField('code');
const [description] = defineField('description');
watch(open, (value) => value && reset());
</script>

<template>
  <FormModal v-model:open="open" :title="editing ? $t('courses.editLevel') : $t('courses.newLevel')" :loading="isSubmitting" :error="formError" size="sm" @submit="onSubmit">
    <FormField v-slot="field" :label="$t('courses.levelName')" :error="errors.name">
      <AppInput :id="field.id" v-model="name" :placeholder="$t('courses.levelPlaceholder')" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
    <FormField v-slot="field" :label="$t('common.code')" :error="errors.code">
      <AppInput :id="field.id" v-model="code" autocapitalize="characters" placeholder="A1" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
    <FormField v-slot="field" :label="$t('common.description')" optional :error="errors.description">
      <AppInput :id="field.id" v-model="description" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
  </FormModal>
</template>
