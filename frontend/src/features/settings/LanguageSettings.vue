<script setup lang="ts">
import { Check } from 'lucide-vue-next';
import { appConfig } from '@/app/config/app.config';
import { usePreferencesStore } from '@/stores/preferences.store';
import SettingsPanel from './SettingsPanel.vue';

const preferences = usePreferencesStore();
</script>

<template>
  <SettingsPanel :title="$t('settings.language.title')" :description="$t('settings.language.text')">
    <fieldset>
      <legend class="sr-only">{{ $t('language.title') }}</legend>
      <div class="flex flex-col gap-2">
        <label
          v-for="locale in appConfig.locales"
          :key="locale"
          class="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
          :class="$i18n.locale === locale ? 'border-primary bg-primary-soft text-primary-soft-fg' : 'border-border hover:bg-surface-hover'"
        >
          <input
            type="radio"
            name="locale"
            class="sr-only"
            :value="locale"
            :checked="$i18n.locale === locale"
            @change="preferences.chooseLocale(locale)"
          />
          <span class="flex-1 font-medium">{{ $t(`language.${locale}`) }}</span>
          <Check v-if="$i18n.locale === locale" class="size-4" aria-hidden="true" />
        </label>
      </div>
    </fieldset>
  </SettingsPanel>
</template>
