import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db } from '@/database/db'
import type { Channel, HistoryEntry } from '@/types'

const MAX_HISTORY = 50

export const useHistoryStore = defineStore('history', () => {
  // ─── State ─────────────────────────────────────────────────────────────────
  const entries = ref<HistoryEntry[]>([])

  // ─── Actions ────────────────────────────────────────────────────────────────

  async function loadHistory(): Promise<void> {
    entries.value = await db.history
      .orderBy('watchedAt')
      .reverse()
      .limit(MAX_HISTORY)
      .toArray()
  }

  async function addEntry(channel: Channel, playlistId: number): Promise<void> {
    // Remove duplicata do mesmo canal para manter só a entrada mais recente
    await db.history.where('channelId').equals(channel.id!).delete()

    await db.history.add({
      channelId: channel.id!,
      channelName: channel.name,
      channelLogo: channel.logo,
      channelGroup: channel.group,
      playlistId,
      watchedAt: new Date(),
    })

    // Limita a MAX_HISTORY entradas no banco
    const total = await db.history.count()
    if (total > MAX_HISTORY) {
      // Remove as mais antigas
      const oldest = await db.history
        .orderBy('watchedAt')
        .limit(total - MAX_HISTORY)
        .toArray()
      await db.history.bulkDelete(oldest.map((e: HistoryEntry) => e.id!))
    }

    await loadHistory()
  }

  async function clearHistory(): Promise<void> {
    await db.history.clear()
    entries.value = []
  }

  async function removeByChannelIds(channelIds: number[]): Promise<void> {
    if (channelIds.length === 0) return
    await db.history.where('channelId').anyOf(channelIds).delete()
    entries.value = entries.value.filter((e: HistoryEntry) => !channelIds.includes(e.channelId))
  }

  return {
    entries,
    loadHistory,
    addEntry,
    clearHistory,
    removeByChannelIds,
  }
})
