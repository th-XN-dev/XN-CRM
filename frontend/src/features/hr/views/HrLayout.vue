<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { P } from '@/app/config/permissions';
import { usePermission } from '@/composables/usePermission';

const { can } = usePermission();
const route = useRoute();
const sections = computed(() =>
  [
    { name: 'hr-employees', key: 'employees', permission: P.EMPLOYEES_READ },
    { name: 'hr-positions', key: 'positions', permission: P.POSITIONS_READ },
    { name: 'hr-departments', key: 'departments', permission: P.DEPARTMENTS_READ },
  ].filter((section) => can(section.permission)),
);
</script>

<template>
  <div>
    <nav v-if="!route.params.id" :aria-label="$t('nav.hr')" class="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul class="inline-flex gap-1 rounded-xl bg-surface-muted p-1">
        <li v-for="section in sections" :key="section.name">
          <RouterLink
            :to="{ name: section.name }"
            :aria-current="route.name === section.name ? 'page' : undefined"
            class="focus-ring flex h-9 items-center rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors"
            :class="route.name === section.name ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'"
          >{{ $t(`hr.sections.${section.key}`) }}</RouterLink>
        </li>
      </ul>
    </nav>
    <RouterView />
  </div>
</template>
