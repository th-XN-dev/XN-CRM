<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import FormModal from '@/components/forms/FormModal.vue';
import AppRadioGroup from '@/components/ui/AppRadioGroup.vue';
import { apiErrorMessage } from '@/composables/useApiErrorMessage';
import type { DirectorDto, UpdateDirectorDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { directorsApi } from '../api';
import { modulesOf, permissionsOf } from '../permission-modules';
import ModulePicker from './ModulePicker.vue';

/** Full DIRECTOR role, or only chosen modules (applies to every director of the center). */
const props = defineProps<{ director: DirectorDto | null }>();
const open = defineModel<boolean>('open', { default: false });
const { t } = useI18n();
const access = ref<'full' | 'custom'>('full');
const modules = ref<string[]>([]);
const error = ref<string | null>(null);
watch(open, (value) => {
  if (!value || !props.director) return;
  error.value = null;
  access.value = props.director.permissions ? 'custom' : 'full';
  modules.value = props.director.permissions ? modulesOf(props.director.permissions) : [];
});
const options = computed(() => [
  { value: 'full' as const, label: t('owner.wizard.permissionsFull') },
  { value: 'custom' as const, label: t('owner.wizard.permissionsCustom') },
]);
const save = useApiMutation({
  fn: (body: UpdateDirectorDto) => directorsApi.update(props.director!.id, body),
  invalidates: [['owner']],
  success: () => t('owner.directors.permissionsSaved'),
  onSuccess: () => {
    open.value = false;
  },
});
async function submit(): Promise<void> {
  error.value = null;
  if (access.value === 'custom' && modules.value.length === 0) {
    error.value = t('validation.choose');
    return;
  }
  try {
    await save.mutateAsync({
      permissions: access.value === 'custom' ? (permissionsOf(modules.value) as UpdateDirectorDto['permissions']) : null,
    });
  } catch (e) {
    error.value = apiErrorMessage(e);
  }
}
</script>

<template>
  <FormModal
    v-model:open="open"
    :title="$t('owner.directors.permissionsTitle', { center: director?.center.name ?? '' })"
    :description="$t('owner.directors.permissionsText')"
    :loading="save.isPending.value"
    :error="error"
    @submit="submit"
  >
    <AppRadioGroup v-model="access" :options="options" :label="$t('owner.directors.permissions')" name="director-permissions" />
    <ModulePicker v-if="access === 'custom'" v-model="modules" />
  </FormModal>
</template>
