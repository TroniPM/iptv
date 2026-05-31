<script setup lang="ts">
const model = defineModel<boolean>({ required: true })

defineProps<{
  label?: string
  disabled?: boolean
}>()
</script>

<template>
  <label
    class="inline-flex items-center gap-3 select-none"
    :class="disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'"
  >
    <button
      role="switch"
      :aria-checked="model"
      :disabled="disabled"
      class="relative w-10 h-5 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed"
      :class="model ? 'bg-indigo-600' : 'bg-zinc-700'"
      @click="!disabled && (model = !model)"
    >
      <span
        class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
        :class="model ? 'translate-x-5' : 'translate-x-0'"
      />
    </button>
    <span v-if="label" class="text-sm text-zinc-300">{{ label }}</span>
  </label>
</template>
