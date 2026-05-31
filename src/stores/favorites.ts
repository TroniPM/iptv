import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db } from '@/database/db'
import type { Channel, Favorite } from '@/types'

export const useFavoritesStore = defineStore('favorites', () => {
  // ─── State ─────────────────────────────────────────────────────────────────
  const favoriteIds = ref<Set<number>>(new Set())

  // ─── Actions ────────────────────────────────────────────────────────────────

  async function loadFavorites(): Promise<void> {
    const rows = await db.favorites.toArray()
    favoriteIds.value = new Set(rows.map((f: Favorite) => f.channelId))
  }

  function isFavorite(channelId: number): boolean {
    return favoriteIds.value.has(channelId)
  }

  async function toggleFavorite(channel: Channel): Promise<void> {
    const id = channel.id!
    if (favoriteIds.value.has(id)) {
      await db.favorites.where('channelId').equals(id).delete()
      favoriteIds.value.delete(id)
    } else {
      await db.favorites.add({ channelId: id, addedAt: new Date() })
      favoriteIds.value.add(id)
    }
  }

  function getFavoriteChannels(allChannels: Channel[]): Channel[] {
    return allChannels.filter((ch) => ch.id !== undefined && favoriteIds.value.has(ch.id))
  }

  return {
    favoriteIds,
    loadFavorites,
    isFavorite,
    toggleFavorite,
    getFavoriteChannels,
  }
})
