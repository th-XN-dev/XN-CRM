<script setup lang="ts">
import { onClickOutside, useEventListener } from '@vueuse/core';
import { nextTick, ref, useId } from 'vue';

/**
 * Menu button pattern: Enter/Space/↓ opens, ↑/↓ move between items, Esc and
 * outside clicks close and return focus to the trigger. Items are elements
 * with role="menuitem" rendered in the default slot.
 */
withDefaults(defineProps<{ align?: 'start' | 'end'; width?: string; label?: string }>(), {
  align: 'end',
  width: 'w-64',
});

const open = ref(false);
const root = ref<HTMLElement>();
const trigger = ref<HTMLElement>();
const menu = ref<HTMLElement>();
const menuId = useId();

function items(): HTMLElement[] {
  return [...(menu.value?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? [])];
}

async function show(focus: 'first' | 'last' = 'first'): Promise<void> {
  open.value = true;
  await nextTick();
  const list = items();
  (focus === 'first' ? list[0] : list.at(-1))?.focus();
}

function hide(returnFocus = true): void {
  if (!open.value) return;
  open.value = false;
  if (returnFocus) trigger.value?.querySelector<HTMLElement>('button, [tabindex]')?.focus();
}

function toggle(): void {
  if (open.value) hide();
  else void show();
}

function onMenuKeydown(event: KeyboardEvent): void {
  const list = items();
  const index = list.indexOf(document.activeElement as HTMLElement);
  const move = (to: number) => list[(to + list.length) % list.length]?.focus();
  if (event.key === 'ArrowDown') move(index + 1);
  else if (event.key === 'ArrowUp') move(index - 1);
  else if (event.key === 'Home') move(0);
  else if (event.key === 'End') move(list.length - 1);
  else if (event.key === 'Escape') hide();
  else if (event.key === 'Tab') hide(false);
  else return;
  event.preventDefault();
}

function onTriggerKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    void show('first');
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    void show('last');
  }
}

onClickOutside(root, () => hide(false));
useEventListener(document, 'keydown', (event: KeyboardEvent) => {
  if (event.key === 'Escape' && open.value) hide();
});

defineExpose({ hide });
</script>

<template>
  <div ref="root" class="relative inline-block">
    <div ref="trigger" @keydown="onTriggerKeydown">
      <slot name="trigger" :open="open" :toggle="toggle" :menu-id="menuId" />
    </div>
    <Transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="scale-95 opacity-0"
      leave-active-class="transition duration-75 ease-in"
      leave-to-class="scale-95 opacity-0"
    >
      <div
        v-if="open"
        :id="menuId"
        ref="menu"
        role="menu"
        :aria-label="label"
        class="glass-strong absolute z-50 mt-2 origin-top rounded-2xl p-1.5"
        :class="[width, align === 'end' ? 'right-0' : 'left-0']"
        @keydown="onMenuKeydown"
        @click="(e) => (e.target as HTMLElement).closest('[data-close]') && hide()"
      >
        <slot :close="hide" />
      </div>
    </Transition>
  </div>
</template>
