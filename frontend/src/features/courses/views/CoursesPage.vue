<script setup lang="ts">
import { ChevronRight, Layers, Plus } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { P } from '@/app/config/permissions';
import FilterSelect from '@/components/data/FilterSelect.vue';
import ListPage from '@/components/data/ListPage.vue';
import ListToolbar from '@/components/data/ListToolbar.vue';
import StatusBadge from '@/components/data/StatusBadge.vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import AppButton from '@/components/ui/AppButton.vue';
import { useFormatters } from '@/composables/useFormatters';
import { usePermission } from '@/composables/usePermission';
import { useListState } from '@/services/query/useListState';
import CourseFormModal from '../components/CourseFormModal.vue';
import { useCourses } from '../queries';

const { t } = useI18n();
const { can } = usePermission();
const router = useRouter();
const format = useFormatters();
const list = useListState({ page: 1, search: '', isActive: 'true', sortBy: 'name', sortOrder: 'asc' });
const courses = useCourses(() => ({ ...list.params.value, limit: 24 }));
const creating = ref(false);
const statusOptions = computed(() => [
  { value: 'true', label: t('status.active.true') },
  { value: 'false', label: t('status.active.false') },
]);
</script>

<template>
  <div>
    <PageHeader :title="$t('nav.courses')" :description="$t('courses.subtitle')">
      <template #actions>
        <AppButton v-if="can(P.COURSES_CREATE)" :icon="Plus" @click="creating = true">{{ $t('courses.new') }}</AppButton>
      </template>
    </PageHeader>
    <ListToolbar
      :search="list.state.search"
      :search-label="$t('courses.search')"
      :active-filters="list.activeFilters.value"
      @update:search="list.set({ search: $event })"
      @reset="list.reset()"
    >
      <template #filters>
        <FilterSelect :model-value="list.state.isActive" :label="$t('common.status')" :options="statusOptions" @update:model-value="list.set({ isActive: $event })" />
      </template>
    </ListToolbar>
    <ListPage
      :create-label="can(P.COURSES_CREATE) && !(list.state.search || list.activeFilters.value > 1) ? $t('courses.new') : undefined"
      :loading="courses.isPending.value"
      :error="courses.error.value"
      :meta="courses.data.value?.meta"
      :page="list.state.page"
      :empty-title="$t('courses.emptyTitle')"
      :empty-text="$t('courses.emptyText')"
      plain
      @create="creating = true"
      @update:page="list.set({ page: $event })"
      @retry="courses.refetch()"
    >
      <ul class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <li v-for="course in courses.data.value?.items ?? []" :key="course.id">
          <RouterLink
            :to="{ name: 'course', params: { id: course.id } }"
            class="focus-ring group flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-card transition-colors hover:border-primary"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate font-semibold text-fg">{{ course.name }}</p>
                <p class="text-xs text-fg-muted">{{ course.code }}</p>
              </div>
              <StatusBadge v-if="!course.isActive" kind="active" :value="false" />
              <ChevronRight v-else class="size-5 text-fg-subtle group-hover:text-primary-text" aria-hidden="true" />
            </div>
            <p v-if="course.description" class="line-clamp-2 text-sm text-fg-muted">{{ course.description }}</p>
            <div class="mt-auto flex items-center justify-between gap-3 text-sm">
              <span class="inline-flex items-center gap-1.5 text-fg-muted">
                <Layers class="size-4" aria-hidden="true" />{{ $t('courses.levelsCount', { count: course.levelsCount }, course.levelsCount) }}
              </span>
              <span class="font-medium text-fg tabular-nums">{{ $t('courses.perMonth', { price: format.money(course.monthlyPrice) }) }}</span>
            </div>
          </RouterLink>
        </li>
      </ul>
    </ListPage>
    <CourseFormModal v-model:open="creating" @saved="(course) => router.push({ name: 'course', params: { id: course.id } })" />
  </div>
</template>
