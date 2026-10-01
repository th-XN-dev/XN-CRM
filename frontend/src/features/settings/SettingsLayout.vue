<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next';
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import PageHeader from '@/components/layout/PageHeader.vue';
import { useSettingsSections } from './useSettingsSections';

const sections = useSettingsSections();
const route = useRoute();
const isIndex = computed(() => route.name === 'settings');
</script>

<template>
  <PageHeader :title="$t('settings.title')" />
  <div class="lg:grid lg:grid-cols-[15rem_1fr] lg:gap-8">
    <nav :aria-label="$t('settings.title')" class="hidden lg:block">
      <ul class="sticky top-28 flex flex-col gap-1">
        <li v-for="section in sections" :key="section.key">
          <RouterLink
            :to="section.to ?? `/settings/${section.key}`"
            class="focus-ring flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-fg-muted hover:bg-surface-hover hover:text-fg"
            active-class="!bg-primary-soft !text-primary-soft-fg"
          >
            <component :is="section.icon" class="size-4.5" aria-hidden="true" />
            {{ $t(`settings.sections.${section.key}`) }}
          </RouterLink>
        </li>
      </ul>
    </nav>
    <div class="min-w-0">
      <RouterLink
        v-if="!isIndex"
        to="/settings"
        class="focus-ring mb-4 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-primary-text lg:hidden"
      >
        <ArrowLeft class="size-4" aria-hidden="true" />{{ $t('settings.title') }}
      </RouterLink>
      <RouterView />
    </div>
  </div>
</template>
