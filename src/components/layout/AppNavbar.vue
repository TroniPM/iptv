<script setup lang="ts">
import { useRoute } from 'vue-router'
import { computed, ref } from 'vue'
import { useI18n } from '@/i18n'

const route = useRoute()
const menuOpen = ref(false)
const { t } = useI18n()

const navLinks = computed(() => [
  { to: '/',         label: t('nav.player')   },
  { to: '/settings', label: t('nav.settings') },
])
</script>

<template>
  <header class="h-14 bg-zinc-900 border-b border-zinc-800 flex items-center px-4 gap-4 shrink-0">
    <!-- Logo -->
    <span class="text-white font-bold text-lg tracking-tight select-none">
      📺 IPTV Player
    </span>

    <!-- Desktop nav -->
    <nav class="hidden md:flex gap-2 ml-4">
      <RouterLink
        v-for="link in navLinks"
        :key="link.to"
        :to="link.to"
        class="px-3 py-1.5 rounded text-sm font-medium transition-colors"
        :class="
          route.path === link.to
            ? 'bg-indigo-600 text-white'
            : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
        "
      >
        {{ link.label }}
      </RouterLink>
    </nav>

    <div class="flex-1" />

    <!-- Hamburger (mobile) -->
    <button
      class="md:hidden p-2 rounded text-zinc-400 hover:text-white hover:bg-zinc-800"
      aria-label="Abrir menu"
      @click="menuOpen = !menuOpen"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          v-if="!menuOpen"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M4 6h16M4 12h16M4 18h16"
        />
        <path
          v-else
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    </button>
  </header>

  <!-- Mobile dropdown menu -->
  <div
    v-if="menuOpen"
    class="md:hidden bg-zinc-900 border-b border-zinc-800 flex flex-col px-4 pb-3 gap-1"
  >
    <RouterLink
      v-for="link in navLinks"
      :key="link.to"
      :to="link.to"
      class="px-3 py-2 rounded text-sm font-medium transition-colors"
      :class="
        route.path === link.to
          ? 'bg-indigo-600 text-white'
          : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
      "
      @click="menuOpen = false"
    >
      {{ link.label }}
    </RouterLink>
  </div>
</template>
