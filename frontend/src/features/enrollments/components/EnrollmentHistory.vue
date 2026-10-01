<script setup lang="ts">
import { ArrowRightLeft } from 'lucide-vue-next';
import { RouterLink } from 'vue-router';
import StatusBadge from '@/components/data/StatusBadge.vue';
import { useFormatters } from '@/composables/useFormatters';
import { fullName } from '@/lib/people';
import type { EnrollmentResponseDto } from '@/services/api/schema.gen';

/** Who was where and when — newest first. `show` picks the side that is not the page's own entity. */
defineProps<{ items: readonly EnrollmentResponseDto[]; show: 'group' | 'student' }>();
const format = useFormatters();
</script>

<template>
  <ol class="flex flex-col">
    <li v-for="item in items" :key="item.id" class="flex items-start gap-3 border-b border-border py-3 last:border-0">
      <span class="mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-fg-muted">
        <ArrowRightLeft v-if="item.transferredFromId" class="size-4" aria-hidden="true" />
        <span v-else class="size-2 rounded-full bg-current" aria-hidden="true" />
      </span>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <RouterLink
            v-if="show === 'group'"
            :to="{ name: 'group', params: { id: item.groupId } }"
            class="focus-ring rounded font-medium text-fg hover:text-primary-text"
          >{{ item.group.name }}</RouterLink>
          <RouterLink
            v-else
            :to="{ name: 'student', params: { id: item.studentId } }"
            class="focus-ring rounded font-medium text-fg hover:text-primary-text"
          >{{ fullName(item.student) }}</RouterLink>
          <StatusBadge kind="enrollment" :value="item.status" />
        </div>
        <p class="mt-0.5 text-sm text-fg-muted">
          <template v-if="show === 'group'">{{ item.group.course.name }}<template v-if="item.group.level"> · {{ item.group.level.name }}</template> · </template>
          {{ format.day(item.startedAt) }} — {{ item.endedAt ? format.day(item.endedAt) : $t('enrollments.now') }}
        </p>
        <p v-if="item.notes" class="mt-1 text-sm text-fg">{{ item.notes }}</p>
      </div>
    </li>
  </ol>
</template>
