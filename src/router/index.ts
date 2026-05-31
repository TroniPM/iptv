import { createRouter, createWebHashHistory } from 'vue-router'
import PlayerView from '@/views/PlayerView.vue'
import SettingsView from '@/views/SettingsView.vue'

const router = createRouter({
  // Hash history: funciona sem servidor (arquivos locais / extensões)
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'player',
      component: PlayerView,
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView,
    },
  ],
})

export default router
