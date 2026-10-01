<script setup lang="ts">
import { ArrowDown, ArrowUp, Pencil, Plus, Power } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { P } from '@/app/config/permissions';
import DetailHeader from '@/components/data/DetailHeader.vue';
import SectionCard from '@/components/data/SectionCard.vue';
import StatusBadge from '@/components/data/StatusBadge.vue';
import EmptyState from '@/components/feedback/EmptyState.vue';
import QueryState from '@/components/feedback/QueryState.vue';
import AppButton from '@/components/ui/AppButton.vue';
import { useConfirm } from '@/composables/useConfirm';
import { useFormatters } from '@/composables/useFormatters';
import { usePermission } from '@/composables/usePermission';
import { useGroups } from '@/features/groups/queries';
import type { LevelResponseDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { coursesApi } from '../api';
import CourseFormModal from '../components/CourseFormModal.vue';
import LevelFormModal from '../components/LevelFormModal.vue';
import { useCourse } from '../queries';

/** Course → its levels, in teaching order. Groups of the course are listed for context. */
const props = defineProps<{ id: string }>();
const { t } = useI18n();
const { can } = usePermission();
const confirm = useConfirm();
const format = useFormatters();
const course = useCourse(() => props.id);
const groups = useGroups(() => ({ courseId: props.id, status: 'ACTIVE', limit: 50, sortBy: 'name', sortOrder: 'asc' }), () => can([P.GROUPS_READ, P.GROUPS_READ_OWN]));
const levels = computed(() => [...(course.data.value?.levels ?? [])].sort((a, b) => a.order - b.order));
const editing = ref(false);
const levelOpen = ref(false);
const editedLevel = ref<LevelResponseDto | null>(null);

const invalidates = [['courses'], ['groups']] as const;
const setCourseActive = useApiMutation({
  fn: (active: boolean) => (active ? coursesApi.update(props.id, { isActive: true }) : coursesApi.deactivate(props.id)),
  invalidates,
  toastError: true,
});
const updateLevel = useApiMutation({
  fn: ({ id, ...body }: { id: string; order?: number; isActive?: boolean }) =>
    body.isActive === false ? coursesApi.deactivateLevel(id) : coursesApi.updateLevel(id, body),
  invalidates,
  toastError: true,
});

function openLevel(level: LevelResponseDto | null): void {
  editedLevel.value = level;
  levelOpen.value = true;
}

/** Swap two neighbours' order values. */
async function move(index: number, step: -1 | 1): Promise<void> {
  const a = levels.value[index];
  const b = levels.value[index + step];
  if (!a || !b) return;
  await updateLevel.mutateAsync({ id: a.id, order: b.order });
  await updateLevel.mutateAsync({ id: b.id, order: a.order });
}

async function toggleCourse(): Promise<void> {
  const data = course.data.value;
  if (!data) return;
  if (data.isActive && !(await confirm({ title: t('courses.deactivateTitle', { name: data.name }), message: t('courses.deactivateText'), danger: true, confirmLabel: t('common.deactivate') }))) return;
  await setCourseActive.mutateAsync(!data.isActive).catch(() => undefined);
}
</script>

<template>
  <QueryState :loading="course.isPending.value" :error="course.error.value" loading-variant="page" @retry="course.refetch()">
    <div v-if="course.data.value">
      <DetailHeader
        :title="course.data.value.name"
        :subtitle="`${course.data.value.code} · ${$t('courses.perMonth', { price: format.money(course.data.value.monthlyPrice) })}`"
        :back="{ name: 'courses' }"
        :back-label="$t('nav.courses')"
      >
        <template #badges><StatusBadge kind="active" :value="course.data.value.isActive" /></template>
        <template #actions>
          <AppButton v-if="can(P.COURSES_UPDATE)" variant="secondary" :icon="Pencil" @click="editing = true">{{ $t('common.edit') }}</AppButton>
          <AppButton
            v-if="can(course.data.value.isActive ? P.COURSES_DELETE : P.COURSES_UPDATE)"
            variant="ghost"
            :icon="Power"
            :loading="setCourseActive.isPending.value"
            @click="toggleCourse"
          >
            {{ course.data.value.isActive ? $t('common.deactivate') : $t('common.activate') }}
          </AppButton>
        </template>
      </DetailHeader>

      <div class="grid gap-4 lg:grid-cols-3">
        <SectionCard :title="$t('courses.levels')" :description="$t('courses.levelsHint')" class="lg:col-span-2" flush>
          <template #actions>
            <AppButton v-if="can(P.COURSES_CREATE)" size="sm" variant="soft" :icon="Plus" @click="openLevel(null)">{{ $t('courses.newLevel') }}</AppButton>
          </template>
          <EmptyState v-if="levels.length === 0" compact :text="$t('courses.noLevels')" />
          <ol v-else>
            <li v-for="(level, index) in levels" :key="level.id" class="flex items-center gap-3 border-t border-border px-5 py-3 first:border-0">
              <span class="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary-soft-fg">{{ index + 1 }}</span>
              <div class="min-w-0 flex-1" :class="!level.isActive && 'opacity-60'">
                <p class="truncate font-medium text-fg">{{ level.name }} <span class="text-xs font-normal text-fg-muted">{{ level.code }}</span></p>
                <p v-if="level.description" class="truncate text-sm text-fg-muted">{{ level.description }}</p>
              </div>
              <StatusBadge v-if="!level.isActive" kind="active" :value="false" />
              <div v-if="can(P.COURSES_UPDATE)" class="flex shrink-0 items-center">
                <AppButton variant="ghost" size="sm" icon-only :icon="ArrowUp" :label="$t('courses.moveUp')" :disabled="index === 0 || updateLevel.isPending.value" @click="move(index, -1)" />
                <AppButton variant="ghost" size="sm" icon-only :icon="ArrowDown" :label="$t('courses.moveDown')" :disabled="index === levels.length - 1 || updateLevel.isPending.value" @click="move(index, 1)" />
                <AppButton variant="ghost" size="sm" icon-only :icon="Pencil" :label="$t('common.edit')" @click="openLevel(level)" />
                <AppButton
                  variant="ghost"
                  size="sm"
                  icon-only
                  :icon="Power"
                  :label="level.isActive ? $t('common.deactivate') : $t('common.activate')"
                  @click="updateLevel.mutate({ id: level.id, isActive: !level.isActive })"
                />
              </div>
            </li>
          </ol>
        </SectionCard>

        <SectionCard :title="$t('courses.groups')" flush>
          <EmptyState v-if="groups.data.value?.items.length === 0" compact :text="$t('courses.noGroups')" />
          <ul v-else>
            <li v-for="group in groups.data.value?.items ?? []" :key="group.id" class="border-t border-border first:border-0">
              <RouterLink :to="{ name: 'group', params: { id: group.id } }" class="focus-ring flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-hover">
                <span class="min-w-0">
                  <span class="block truncate font-medium text-fg">{{ group.name }}</span>
                  <span class="block truncate text-xs text-fg-muted">{{ group.level?.name ?? $t('courses.noLevel') }}</span>
                </span>
                <span class="text-sm text-fg-muted tabular-nums">{{ group.enrolledCount }} / {{ group.capacity }}</span>
              </RouterLink>
            </li>
          </ul>
        </SectionCard>
      </div>

      <CourseFormModal v-model:open="editing" :course="course.data.value" />
      <LevelFormModal v-model:open="levelOpen" :course-id="id" :level="editedLevel" :next-order="(levels.at(-1)?.order ?? 0) + 1" />
    </div>
  </QueryState>
</template>
