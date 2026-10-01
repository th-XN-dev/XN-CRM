<script setup lang="ts">
import { ArrowLeft, ChevronRight, Layers, MapPin } from 'lucide-vue-next';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { P } from '@/app/config/permissions';
import EmptyState from '@/components/feedback/EmptyState.vue';
import OnboardingLayout from '@/components/layout/OnboardingLayout.vue';
import AppButton from '@/components/ui/AppButton.vue';
import { useContextSwitch } from '@/composables/useContextSwitch';
import { useAuthStore } from '@/stores/auth.store';
import { ALL_BRANCHES, useSessionStore } from '@/stores/session.store';
import CreateBranchForm from './CreateBranchForm.vue';

const session = useSessionStore();
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const { switchBranch } = useContextSwitch();
const redirect = computed(() => (typeof route.query.redirect === 'string' ? route.query.redirect : '/'));
const canCreate = computed(() => session.can(P.BRANCH_CREATE));

function choose(id: string): Promise<void> {
  return switchBranch(id, redirect.value);
}

/** The first branch was just created: load it into the context, then work in it. */
async function created(id: string): Promise<void> {
  await session.reloadContext();
  await choose(id);
}
</script>

<template>
  <OnboardingLayout
    :title="session.branches.length ? $t('onboarding.selectBranch') : $t('onboarding.noBranches')"
    :subtitle="session.branches.length ? $t('onboarding.selectBranchHint') : undefined"
  >
    <p class="-mt-3 mb-5 text-sm font-medium text-primary-text">{{ session.organization?.name }}</p>
    <ul v-if="session.branches.length" class="flex flex-col gap-2">
      <li v-if="session.canChooseAllBranches">
        <button
          type="button"
          class="focus-ring flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-3 text-left hover:border-primary hover:bg-surface-hover"
          @click="choose(ALL_BRANCHES)"
        >
          <span class="inline-flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-fg">
            <Layers class="size-5" aria-hidden="true" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block font-medium text-fg">{{ $t('onboarding.allBranches') }}</span>
            <span class="block text-sm text-fg-muted">{{ $t('onboarding.allBranchesHint') }}</span>
          </span>
          <ChevronRight class="size-5 text-fg-subtle" aria-hidden="true" />
        </button>
      </li>
      <li v-for="branch in session.branches" :key="branch.id">
        <button
          type="button"
          class="focus-ring flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-3 text-left hover:border-primary hover:bg-surface-hover"
          @click="choose(branch.id)"
        >
          <span class="inline-flex size-11 items-center justify-center rounded-xl bg-surface-muted text-fg-muted">
            <MapPin class="size-5" aria-hidden="true" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium text-fg">{{ branch.name }}</span>
            <span class="block text-sm text-fg-muted">{{ branch.code }}</span>
          </span>
          <ChevronRight class="size-5 text-fg-subtle" aria-hidden="true" />
        </button>
      </li>
    </ul>
    <template v-else>
      <template v-if="canCreate">
        <p class="mb-4 text-sm text-fg-muted">{{ $t('onboarding.noBranchesHint') }}</p>
        <CreateBranchForm @created="created" />
      </template>
      <EmptyState v-else compact :icon="MapPin" :title="$t('onboarding.noBranches')" :text="$t('onboarding.noBranchesNoAccess')" />
    </template>
    <AppButton
      v-if="(auth.profile?.organizations.length ?? 0) > 1"
      class="mt-6"
      variant="ghost"
      block
      :icon="ArrowLeft"
      @click="router.push({ name: 'select-organization', query: { redirect } })"
    >
      {{ $t('onboarding.selectOrganization') }}
    </AppButton>
  </OnboardingLayout>
</template>
