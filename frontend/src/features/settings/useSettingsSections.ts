import { computed } from 'vue';
import { useSessionStore } from '@/stores/session.store';
import { settingsSections } from './sections';

export function useSettingsSections() {
  const session = useSessionStore();
  return computed(() => settingsSections.filter((section) => session.can(section.permission)));
}
