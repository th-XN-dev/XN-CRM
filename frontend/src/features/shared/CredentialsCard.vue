<script setup lang="ts">
import { Copy } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import AppButton from '@/components/ui/AppButton.vue';
import { useToastStore } from '@/stores/toast.store';

export interface Credentials {
  name: string;
  login: string;
  /** null: an existing account was linked and keeps its own password. */
  temporaryPassword: string | null;
}

/** Sign-in details of a new account, shown once (the password is never stored in plain text). */
const props = defineProps<{ credentials: Credentials }>();
const { t } = useI18n();
const toast = useToastStore();

async function copy(): Promise<void> {
  const c = props.credentials;
  const lines = [`${t('owner.credentials.login')}: ${c.login}`];
  if (c.temporaryPassword) lines.push(`${t('owner.credentials.password')}: ${c.temporaryPassword}`);
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    toast.success(t('owner.credentials.copied'));
  } catch {
    toast.error(t('errors.UNKNOWN'));
  }
}
</script>

<template>
  <div>
    <p class="text-sm text-fg-muted">
      {{ credentials.temporaryPassword ? $t('owner.credentials.text', { name: credentials.name }) : $t('owner.credentials.linked', { name: credentials.name }) }}
    </p>
    <dl class="mt-3 grid gap-3 rounded-2xl border border-border bg-surface-muted p-4">
      <div>
        <dt class="text-xs text-fg-muted">{{ $t('owner.credentials.login') }}</dt>
        <dd class="font-mono text-sm break-all text-fg" data-testid="credentials-login">{{ credentials.login }}</dd>
      </div>
      <div v-if="credentials.temporaryPassword">
        <dt class="text-xs text-fg-muted">{{ $t('owner.credentials.password') }}</dt>
        <dd class="font-mono text-lg tracking-wide text-fg" data-testid="credentials-password">{{ credentials.temporaryPassword }}</dd>
      </div>
    </dl>
    <AppButton class="mt-3" variant="secondary" size="sm" :icon="Copy" @click="copy">{{ $t('owner.credentials.copyAll') }}</AppButton>
  </div>
</template>
