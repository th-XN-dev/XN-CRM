<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import AppBadge from '@/components/ui/AppBadge.vue';
import QueryState from '@/components/feedback/QueryState.vue';
import { moduleOf, PERMISSION_MODULES } from '@/features/directors/permission-modules';
import SettingsPanel from '@/features/settings/SettingsPanel.vue';
import { useStaffRoles } from '../api';

/** Read-only overview of the staff roles: which modules each one reaches. */
const { t, te } = useI18n();
const roles = useStaffRoles();
const rows = computed(() =>
  (roles.data.value ?? []).map((role) => {
    const modules = PERMISSION_MODULES.map((module) => ({
      key: module.key,
      count: role.permissions.filter((permission) => moduleOf(permission) === module.key).length,
    })).filter((module) => module.count > 0);
    return { ...role, label: te(`roles.${role.key}`) ? t(`roles.${role.key}`) : role.name, modules };
  }),
);
</script>

<template>
  <SettingsPanel :title="$t('management.roles.title')" :description="$t('management.roles.subtitle')">
    <QueryState :loading="roles.isPending.value" :error="roles.error.value" loading-variant="list" @retry="roles.refetch()">
      <ul class="flex flex-col gap-3">
        <li v-for="role in rows" :key="role.key" class="rounded-2xl border border-border p-4">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="font-semibold text-fg">{{ role.label }}</h3>
            <AppBadge>{{ $t('management.roles.count', { count: role.permissions.length }, role.permissions.length) }}</AppBadge>
            <AppBadge v-if="!role.assignable" tone="warning">{{ $t('management.roles.notAssignable') }}</AppBadge>
          </div>
          <ul class="mt-3 flex flex-wrap gap-1.5">
            <li v-for="module in role.modules" :key="module.key">
              <AppBadge tone="brand">{{ $t(`owner.modules.${module.key}`) }} · {{ module.count }}</AppBadge>
            </li>
          </ul>
        </li>
      </ul>
    </QueryState>
  </SettingsPanel>
</template>
