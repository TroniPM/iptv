<script setup lang="ts">
defineProps<{
  title?: string
}>()

const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      @click.self="emit('close')"
    >
      <div class="bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-lg shadow-2xl">
        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 class="text-base font-semibold text-white">{{ title }}</h2>
          <button
            class="text-zinc-500 hover:text-white transition-colors p-1 rounded"
            aria-label="Fechar"
            @click="emit('close')"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Body -->
        <div class="px-5 py-4">
          <slot />
        </div>

        <!-- Footer (opcional) -->
        <div v-if="$slots.footer" class="px-5 py-3 border-t border-zinc-800 flex justify-end gap-2">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
