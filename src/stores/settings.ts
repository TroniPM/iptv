import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db } from '@/database/db'
import type { AppSettings } from '@/types'

export const useSettingsStore = defineStore('settings', () => {
  // ─── State ─────────────────────────────────────────────────────────────────
  const groupingEnabled = ref(true)
  const proxyEnabled = ref(false)
  const proxyUrl = ref('')
  const forceHttps = ref(false)
  const lastChannelId = ref<number | null>(null)
  const lastPlaylistId = ref<number | null>(null)
  const language = ref<string>('pt-BR')

  // ─── Actions ────────────────────────────────────────────────────────────────

  async function load() {
    const record = await db.settings.get(1)
    if (record) {
      groupingEnabled.value = record.groupingEnabled ?? true
      proxyEnabled.value = record.proxyEnabled ?? false
      proxyUrl.value = record.proxyUrl ?? ''
      forceHttps.value = record.forceHttps ?? false
      lastChannelId.value = record.lastChannelId ?? null
      lastPlaylistId.value = record.lastPlaylistId ?? null
      language.value = record.language ?? 'pt-BR'
    }
  }

  async function save(partial: Partial<AppSettings>) {
    if ('groupingEnabled' in partial)
      groupingEnabled.value = partial.groupingEnabled!
    if ('proxyEnabled' in partial) proxyEnabled.value = partial.proxyEnabled!
    if ('proxyUrl' in partial) proxyUrl.value = partial.proxyUrl!
    if ('forceHttps' in partial) forceHttps.value = partial.forceHttps!
    if ('lastChannelId' in partial) lastChannelId.value = partial.lastChannelId!
    if ('lastPlaylistId' in partial)
      lastPlaylistId.value = partial.lastPlaylistId!
    if ('language' in partial) language.value = partial.language!

    await db.settings.update(1, partial)
  }

  async function toggleGrouping() {
    await save({ groupingEnabled: !groupingEnabled.value })
  }

  async function toggleProxy() {
    await save({ proxyEnabled: !proxyEnabled.value })
  }

  async function toggleForceHttps() {
    await save({ forceHttps: !forceHttps.value })
  }

  async function setLanguage(lang: string) {
    await save({ language: lang })
  }

  return {
    groupingEnabled,
    proxyEnabled,
    proxyUrl,
    forceHttps,
    lastChannelId,
    lastPlaylistId,
    language,
    load,
    save,
    toggleGrouping,
    toggleProxy,
    toggleForceHttps,
    setLanguage,
  }
})
