<script setup lang="ts">
import { computed, type Component } from 'vue';
import { RouterLink, type RouteLocationRaw } from 'vue-router';
import AppSpinner from './AppSpinner.vue';

export type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger';

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant;
    size?: 'sm' | 'md' | 'lg';
    type?: 'button' | 'submit' | 'reset';
    to?: RouteLocationRaw;
    /** External / protocol link (tel:, mailto:, https:). */
    href?: string;
    icon?: Component;
    /** Icon-only button: `label` becomes its accessible name. */
    iconOnly?: boolean;
    label?: string;
    loading?: boolean;
    disabled?: boolean;
    block?: boolean;
  }>(),
  { variant: 'primary', size: 'md', type: 'button' },
);

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-fg shadow-sm hover:bg-primary-hover',
  secondary: 'border border-border-strong bg-surface text-fg shadow-sm hover:bg-surface-hover',
  soft: 'bg-primary-soft text-primary-soft-fg hover:brightness-95 dark:hover:brightness-125',
  ghost: 'text-fg-muted hover:bg-surface-hover hover:text-fg',
  danger: 'bg-danger text-white shadow-sm hover:brightness-95',
};

// Touch targets: 44px on phones (md), a little tighter from sm breakpoint up.
const sizes = {
  sm: 'h-9 gap-1.5 px-3 text-sm',
  md: 'h-11 gap-2 px-4 text-sm sm:h-10',
  lg: 'h-12 gap-2 px-5 text-base',
};
const iconSizes = { sm: 'size-9', md: 'size-11 sm:size-10', lg: 'size-12' };

const classes = computed(() => [
  'focus-ring inline-flex shrink-0 items-center justify-center rounded-xl font-medium transition-colors',
  'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
  variants[props.variant],
  props.iconOnly ? iconSizes[props.size] : sizes[props.size],
  props.block && 'w-full',
]);
const isDisabled = computed(() => props.disabled || props.loading);
</script>

<template>
  <RouterLink
    v-if="to && !isDisabled"
    :to="to"
    :class="classes"
    :aria-label="iconOnly ? label : undefined"
  >
    <component :is="icon" v-if="icon" class="size-4.5" aria-hidden="true" />
    <span v-if="!iconOnly"><slot>{{ label }}</slot></span>
  </RouterLink>
  <a v-else-if="href && !isDisabled" :href="href" :class="classes" :aria-label="iconOnly ? label : undefined">
    <component :is="icon" v-if="icon" class="size-4.5" aria-hidden="true" />
    <span v-if="!iconOnly"><slot>{{ label }}</slot></span>
  </a>
  <button
    v-else
    :type="type"
    :class="classes"
    :disabled="isDisabled"
    :aria-busy="loading || undefined"
    :aria-label="iconOnly ? label : undefined"
  >
    <AppSpinner v-if="loading" size="sm" />
    <component :is="icon" v-else-if="icon" class="size-4.5" aria-hidden="true" />
    <span v-if="!iconOnly"><slot>{{ label }}</slot></span>
  </button>
</template>
