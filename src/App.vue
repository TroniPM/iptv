<script setup lang="ts">
import AppNavbar from '@/components/layout/AppNavbar.vue'
</script>

<template>
  <div class="flex flex-col min-h-svh bg-zinc-950">
    <AppNavbar />
    <RouterView />
  </div>
</template>

