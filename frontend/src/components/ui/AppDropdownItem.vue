<script setup lang="ts">
import type { Component } from 'vue';
import { RouterLink, type RouteLocationRaw } from 'vue-router';

defineProps<{ icon?: Component; to?: RouteLocationRaw; active?: boolean; danger?: boolean; inset?: boolean }>();
defineEmits<{ select: [] }>();
</script>

<template>
  <component
    :is="to ? RouterLink : 'button'"
    :to="to"
    :type="to ? undefined : 'button'"
    role="menuitem"
    tabindex="-1"
    data-close
    class="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm outline-none hover:bg-surface-hover focus-visible:bg-surface-hover sm:min-h-10"
    :class="[danger ? 'text-danger' : 'text-fg', active && 'font-semibold text-primary-text']"
    :aria-current="active || undefined"
    @click="$emit('select')"
  >
    <component :is="icon" v-if="icon" class="size-4.5 shrink-0 text-fg-subtle" aria-hidden="true" />
    <span v-else-if="inset" class="size-4.5 shrink-0" aria-hidden="true" />
    <span class="min-w-0 flex-1 truncate"><slot /></span>
    <slot name="end" />
  </component>
</template>
