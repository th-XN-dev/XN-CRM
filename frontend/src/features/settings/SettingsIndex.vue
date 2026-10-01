<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next';
import { RouterLink } from 'vue-router';
import { useSettingsSections } from './useSettingsSections';

const sections = useSettingsSections();
</script>

<template>
  <ul class="grid gap-2 sm:grid-cols-2">
    <li v-for="section in sections" :key="section.key">
      <RouterLink
        :to="section.to ?? `/settings/${section.key}`"
        class="focus-ring flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card hover:border-primary"
      >
        <span class="inline-flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-fg">
          <component :is="section.icon" class="size-5" aria-hidden="true" />
        </span>
        <span class="flex-1 font-medium text-fg">{{ $t(`settings.sections.${section.key}`) }}</span>
        <ChevronRight class="size-5 text-fg-subtle" aria-hidden="true" />
      </RouterLink>
    </li>
  </ul>
</template>
