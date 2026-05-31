<script setup lang="ts">
const model = defineModel<boolean>({ required: true })

defineProps<{
  label?: string
}>()
</script>

<template>
  <label class="inline-flex items-center gap-3 cursor-pointer select-none">
    <button
      role="switch"
      :aria-checked="model"
      class="relative w-10 h-5 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      :class="model ? 'bg-indigo-600' : 'bg-zinc-700'"
      @click="model = !model"
    >
      <span
        class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
        :class="model ? 'translate-x-5' : 'translate-x-0'"
      />
    </button>
    <span v-if="label" class="text-sm text-zinc-300">{{ label }}</span>
  </label>
</template>
