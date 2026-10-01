<script setup lang="ts">
import { Monitor, Moon, Sun } from 'lucide-vue-next';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import SegmentedControl from '@/components/ui/SegmentedControl.vue';
import { type ThemePreference, useTheme } from '@/composables/useTheme';
import SettingsPanel from './SettingsPanel.vue';

const { t } = useI18n();
const { preference } = useTheme();
const options = computed(() => [
  { value: 'light', label: t('theme.light'), icon: Sun },
  { value: 'dark', label: t('theme.dark'), icon: Moon },
  { value: 'system', label: t('theme.system'), icon: Monitor },
]);
const model = computed({
  get: () => preference.value,
  set: (value: string) => (preference.value = value as ThemePreference),
});
</script>

<template>
  <SettingsPanel :title="$t('settings.appearance.title')" :description="$t('settings.appearance.text')">
    <SegmentedControl v-model="model" :options="options" :label="$t('theme.title')" name="theme" class="w-full sm:w-auto" />
  </SettingsPanel>
</template>
