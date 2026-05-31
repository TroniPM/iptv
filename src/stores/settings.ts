import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db } from '@/database/db'
import type { AppSettings } from '@/types'

export const useSettingsStore = defineStore('settings', () => {
  // ─── State ─────────────────────────────────────────────────────────────────
  const groupingEnabled = ref(true)
  const proxyEnabled = ref(false)
  const proxyUrl = ref('')
  const lastChannelId = ref<number | null>(null)
  const lastPlaylistId = ref<number | null>(null)

  // ─── Actions ────────────────────────────────────────────────────────────────

  async function load() {
    const record = await db.settings.get(1)
    if (record) {
      groupingEnabled.value = record.groupingEnabled ?? true
      proxyEnabled.value = record.proxyEnabled ?? false
      proxyUrl.value = record.proxyUrl ?? ''
      lastChannelId.value = record.lastChannelId ?? null
      lastPlaylistId.value = record.lastPlaylistId ?? null
    }
  }

  async function save(partial: Partial<AppSettings>) {
    if ('groupingEnabled' in partial)
      groupingEnabled.value = partial.groupingEnabled!
    if ('proxyEnabled' in partial) proxyEnabled.value = partial.proxyEnabled!
    if ('proxyUrl' in partial) proxyUrl.value = partial.proxyUrl!
    if ('lastChannelId' in partial) lastChannelId.value = partial.lastChannelId!
    if ('lastPlaylistId' in partial)
      lastPlaylistId.value = partial.lastPlaylistId!

    await db.settings.update(1, partial)
  }

  async function toggleGrouping() {
    await save({ groupingEnabled: !groupingEnabled.value })
  }

  async function toggleProxy() {
    await save({ proxyEnabled: !proxyEnabled.value })
  }

  return {
    groupingEnabled,
    proxyEnabled,
    proxyUrl,
    lastChannelId,
    lastPlaylistId,
    load,
    save,
    toggleGrouping,
    toggleProxy,
  }
})
