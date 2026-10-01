<script setup lang="ts">
import { ArrowRight } from 'lucide-vue-next';
import type { Component } from 'vue';
import { RouterLink } from 'vue-router';

/** One area of the business: a headline number, a few supporting facts, a link to act. */
defineProps<{ title: string; icon: Component; to?: string; headline: string; headlineLabel: string; tone?: 'danger' }>();
</script>

<template>
  <section class="flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-card">
    <header class="mb-3 flex items-center justify-between gap-2">
      <h2 class="flex items-center gap-2 text-sm font-semibold text-fg">
        <span class="inline-flex size-8 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-fg"><component :is="icon" class="size-4" aria-hidden="true" /></span>
        {{ title }}
      </h2>
      <RouterLink v-if="to" :to="to" class="focus-ring inline-flex size-8 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-hover hover:text-fg" :aria-label="title">
        <ArrowRight class="size-4" aria-hidden="true" />
      </RouterLink>
    </header>
    <p class="text-3xl font-semibold tracking-tight tabular-nums" :class="tone === 'danger' ? 'text-danger' : 'text-fg'">{{ headline }}</p>
    <p class="text-sm text-fg-muted">{{ headlineLabel }}</p>
    <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 text-sm"><slot /></dl>
  </section>
</template>
