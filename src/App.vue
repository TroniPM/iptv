<script setup lang="ts">
import { useRoute } from 'vue-router'
import AppNavbar from '@/components/layout/AppNavbar.vue'
import PlayerView from '@/views/PlayerView.vue'

const route = useRoute()
</script>

<template>
  <div class="flex flex-col min-h-svh bg-zinc-950">
    <AppNavbar />
    <div class="relative flex-1">
      <!-- PlayerView sempre no DOM: mantém o stream/áudio ativo em background -->
      <PlayerView />
      <!-- Demais rotas são sobrepostas como overlay -->
      <div
        v-if="route.name !== 'player'"
        class="absolute inset-0 z-10 overflow-auto bg-zinc-950"
      >
        <RouterView />
      </div>
    </div>
  </div>
</template>

