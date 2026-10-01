<script setup lang="ts">
import { watchDebounced } from '@vueuse/core';
import { Search, X } from 'lucide-vue-next';
import { ref, watch } from 'vue';
import { appConfig } from '@/app/config/app.config';

/** Search box: types freely, emits the (trimmed) term after a short pause. */
const props = defineProps<{ label: string; placeholder?: string }>();
const model = defineModel<string>({ default: '' });
const draft = ref(model.value);

watch(model, (value) => {
  if (value !== draft.value.trim()) draft.value = value;
});
watchDebounced(draft, (value) => (model.value = value.trim()), { debounce: appConfig.searchDebounceMs });

function clear(): void {
  draft.value = '';
  model.value = '';
}
</script>

<template>
  <div class="relative flex items-center" role="search">
    <Search class="pointer-events-none absolute left-3 size-4.5 text-fg-subtle" aria-hidden="true" />
    <input
      v-model="draft"
      type="search"
      :aria-label="props.label"
      :placeholder="placeholder ?? props.label"
      enterkeyhint="search"
      class="h-11 w-full rounded-xl border border-border-strong bg-surface pr-11 pl-10 text-base text-fg shadow-sm placeholder:text-fg-subtle focus:border-primary focus:ring-4 focus:ring-ring focus:outline-none sm:h-10 sm:text-sm [&::-webkit-search-cancel-button]:hidden"
      @keydown.esc="clear"
    />
    <button
      v-if="draft"
      type="button"
      class="focus-ring absolute right-1.5 inline-flex size-8 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-hover"
      :aria-label="$t('common.clear')"
      @click="clear"
    >
      <X class="size-4" aria-hidden="true" />
    </button>
  </div>
</template>
