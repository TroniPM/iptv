<script setup lang="ts">
defineProps<{
  label?: string
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  loading?: boolean
}>()
</script>

<template>
  <button
    :disabled="disabled || loading"
    class="inline-flex items-center justify-center gap-2 font-medium rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
    :class="[
      // size
      size === 'sm' ? 'px-2.5 py-1 text-xs' : size === 'lg' ? 'px-5 py-2.5 text-base' : 'px-4 py-2 text-sm',
      // variant
      variant === 'primary' || !variant
        ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
        : variant === 'secondary'
        ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-100'
        : variant === 'danger'
        ? 'bg-red-700 hover:bg-red-600 text-white'
        : 'text-zinc-400 hover:text-white hover:bg-zinc-800',
    ]"
  >
    <svg
      v-if="loading"
      class="w-4 h-4 animate-spin"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
    <slot>{{ label }}</slot>
  </button>
</template>
