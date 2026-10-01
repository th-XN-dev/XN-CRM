import { useLocalStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { storageKeys } from '@/app/config/app.config';
import type { PermissionRequirement } from '@/app/config/permissions';
import { organizationsApi } from '@/features/organizations/api';
import type { OrganizationContext } from '@/types/domain';

/** "all" = no X-Branch-Id: every branch the member can access. */
export const ALL_BRANCHES = 'all';

interface StoredSession {
  userId: string | null;
  organizationId: string | null;
  branchId: string | null;
}

/**
 * The organization/branch the user works in and what they may do there.
 * The server stays the authority: this only shapes the UI and sends the
 * context headers, which the API verifies on every request.
 */
export const useSessionStore = defineStore('session', () => {
  const stored = useLocalStorage<StoredSession>(storageKeys.session, {
    userId: null,
    organizationId: null,
    branchId: null,
  });
  const context = ref<OrganizationContext | null>(null);

  const organizationId = computed(() => stored.value.organizationId);
  const branchId = computed(() => stored.value.branchId);
  const organization = computed(() => context.value?.organization ?? null);
  const branches = computed(() => context.value?.branches ?? []);
  const permissions = computed(() => new Set(context.value?.membership.permissions ?? []));
  const role = computed(() => context.value?.membership.role ?? null);
  const currentBranch = computed(
    () => branches.value.find((b) => b.id === stored.value.branchId) ?? null,
  );
  /** Branch sent to the API (null → all accessible branches). */
  const apiBranchId = computed(() =>
    stored.value.branchId && stored.value.branchId !== ALL_BRANCHES ? stored.value.branchId : null,
  );
  const isReady = computed(
    () => !!context.value && context.value.organization.id === stored.value.organizationId && !!stored.value.branchId,
  );
  const canChooseAllBranches = computed(() => branches.value.length > 1);

  /** Keeps a user's saved choice only for that user (shared computers). */
  function bindUser(userId: string): void {
    if (stored.value.userId !== userId) {
      stored.value = { userId, organizationId: null, branchId: null };
      context.value = null;
    }
  }

  async function selectOrganization(id: string): Promise<OrganizationContext> {
    const loaded = await organizationsApi.context(id);
    const keepBranch =
      stored.value.organizationId === id &&
      (stored.value.branchId === ALL_BRANCHES
        ? loaded.branches.length > 1
        : loaded.branches.some((b) => b.id === stored.value.branchId));
    context.value = loaded;
    stored.value = {
      ...stored.value,
      organizationId: id,
      // One branch → no question to ask.
      branchId: keepBranch
        ? stored.value.branchId
        : loaded.branches.length === 1
          ? (loaded.branches[0]?.id ?? null)
          : null,
    };
    return loaded;
  }

  function selectBranch(id: string): void {
    stored.value = { ...stored.value, branchId: id };
  }

  /** Re-reads branding/permissions (e.g. after the brand was edited). */
  async function reloadContext(): Promise<void> {
    if (stored.value.organizationId) await selectOrganization(stored.value.organizationId);
  }

  function forgetOrganization(): void {
    stored.value = { ...stored.value, organizationId: null, branchId: null };
    context.value = null;
  }

  function clear(): void {
    stored.value = { userId: null, organizationId: null, branchId: null };
    context.value = null;
  }

  function can(requirement: PermissionRequirement | undefined): boolean {
    if (!requirement) return true;
    const list: readonly string[] = typeof requirement === 'string' ? [requirement] : requirement;
    return list.some((permission) => permissions.value.has(permission));
  }

  return {
    context,
    organizationId,
    branchId,
    apiBranchId,
    organization,
    branches,
    currentBranch,
    permissions,
    role,
    isReady,
    canChooseAllBranches,
    bindUser,
    selectOrganization,
    selectBranch,
    reloadContext,
    forgetOrganization,
    clear,
    can,
  };
});
