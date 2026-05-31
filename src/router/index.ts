import { createRouter, createWebHashHistory } from 'vue-router'
import PlayerView from '@/views/PlayerView.vue'
import ManagementView from '@/views/ManagementView.vue'

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
      path: '/manage',
      name: 'manage',
      component: ManagementView,
    },
  ],
})

export default router
