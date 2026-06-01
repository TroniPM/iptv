import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db } from '@/database/db'
import { parseM3U, groupChannels, filterChannels } from '@/services/m3uParser'
import { prepareUrl, checkChannelUrl } from '@/services/stream'
import { useSettingsStore } from '@/stores/settings'
import { useHistoryStore } from '@/stores/history'
import type { Playlist, Channel, ChannelGroup } from '@/types'

export const usePlaylistStore = defineStore('playlist', () => {
  const settingsStore = useSettingsStore()

  // ─── State ─────────────────────────────────────────────────────────────────
  const playlists = ref<Playlist[]>([])
  const channels = ref<Channel[]>([])
  const activePlaylist = ref<Playlist | null>(null)
  const selectedChannel = ref<Channel | null>(null)
  const searchQuery = ref('')
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // ─── Health Check State ──────────────────────────────────────────────────────
  const healthCheck = ref<{
    status: 'idle' | 'running' | 'done'
    checked: number
    total: number
    offlineCount: number
    abortController: AbortController | null
  }>({
    status: 'idle',
    checked: 0,
    total: 0,
    offlineCount: 0,
    abortController: null,
  })

  // ─── Getters ────────────────────────────────────────────────────────────────
  const filteredChannels = computed(() =>
    filterChannels(channels.value, searchQuery.value),
  )

  const groupedChannels = computed<ChannelGroup[]>(() =>
    groupChannels(filteredChannels.value, settingsStore.groupingEnabled),
  )

  // ─── Actions ────────────────────────────────────────────────────────────────

  async function loadPlaylists() {
    playlists.value = await db.playlists.toArray()
  }

  async function loadChannels(playlistId: number) {
    searchQuery.value = ''
    isLoading.value = true
    error.value = null
    try {
      channels.value = await db.channels
        .where('playlistId')
        .equals(playlistId)
        .toArray()
    } catch (e) {
      error.value = 'Erro ao carregar canais.'
      console.error(e)
    } finally {
      isLoading.value = false
    }
  }

  async function selectPlaylist(playlist: Playlist) {
    activePlaylist.value = playlist
    searchQuery.value = ''
    await loadChannels(playlist.id!)
    await db.settings.update(1, { lastPlaylistId: playlist.id })
  }

  function selectChannel(channel: Channel) {
    selectedChannel.value = channel
    db.settings.update(1, { lastChannelId: channel.id })
  }

  async function importFromText(
    rawContent: string,
    name: string,
    source: Playlist['source'],
    sourceValue: string,
  ): Promise<Playlist> {
    isLoading.value = true
    error.value = null
    try {
      const now = new Date()
      const playlistId = await db.playlists.add({
        name,
        source,
        sourceValue,
        rawContent,
        createdAt: now,
        updatedAt: now,
      })

      const parsed = parseM3U(rawContent, playlistId as number)
      await db.channels.bulkAdd(parsed)

      await loadPlaylists()
      const created = playlists.value.find((p: Playlist) => p.id === playlistId)!
      return created
    } catch (e) {
      error.value = 'Erro ao importar lista.'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function importFromUrl(url: string, name: string): Promise<Playlist> {
    isLoading.value = true
    error.value = null
    try {
      const finalUrl = prepareUrl(url, settingsStore.proxyEnabled && Boolean(settingsStore.proxyUrl), settingsStore.proxyUrl)
      const response = await fetch(finalUrl)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const raw = await response.text()
      return importFromText(raw, name, 'url', url)
    } catch (e) {
      error.value = 'Erro ao baixar a lista M3U.'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function deletePlaylist(id: number) {
    await db.channels.where('playlistId').equals(id).delete()
    await db.playlists.delete(id)
    if (activePlaylist.value?.id === id) {
      activePlaylist.value = null
      channels.value = []
      selectedChannel.value = null
    }
    await loadPlaylists()
  }

  async function updatePlaylist(id: number, name: string): Promise<void> {
    await db.playlists.update(id, { name, updatedAt: new Date() })
    await loadPlaylists()
    if (activePlaylist.value?.id === id) {
      activePlaylist.value = playlists.value.find((p: Playlist) => p.id === id) ?? null
    }
  }

  // ─── Health Check ────────────────────────────────────────────────────────────

  async function runHealthCheck(playlistId: number, timeoutMs = 8000, concurrency = 5): Promise<void> {
    const channelsToCheck = await db.channels.where('playlistId').equals(playlistId).toArray()
    if (channelsToCheck.length === 0) return

    const controller = new AbortController()
    healthCheck.value = {
      status: 'running',
      checked: 0,
      total: channelsToCheck.length,
      offlineCount: 0,
      abortController: controller,
    }

    // Zera isOffline de todos antes de verificar
    await db.channels.where('playlistId').equals(playlistId).modify({ isOffline: false })
    channels.value = channels.value.map(ch =>
      ch.playlistId === playlistId ? { ...ch, isOffline: false } : ch,
    )

    const CONCURRENCY = Math.min(Math.max(concurrency, 1), 15)
    let index = 0

    async function worker() {
      while (index < channelsToCheck.length) {
        if (controller.signal.aborted) return
        const ch = channelsToCheck[index++]
        const isOnline = await checkChannelUrl(
          ch.url,
          timeoutMs,
          settingsStore.proxyEnabled && Boolean(settingsStore.proxyUrl),
          settingsStore.proxyUrl,
          settingsStore.forceHttps,
        )
        const isOffline = !isOnline

        if (ch.id !== undefined) {
          await db.channels.update(ch.id, { isOffline })
          const idx = channels.value.findIndex(c => c.id === ch.id)
          if (idx !== -1) {
            channels.value[idx] = { ...channels.value[idx], isOffline }
          }
        }

        healthCheck.value.checked++
        if (isOffline) healthCheck.value.offlineCount++
      }
    }

    const workers = Array.from({ length: CONCURRENCY }, () => worker())
    await Promise.all(workers)

    if (!controller.signal.aborted) {
      healthCheck.value.status = 'done'
    }
    healthCheck.value.abortController = null
  }

  function stopHealthCheck(): void {
    healthCheck.value.abortController?.abort()
    healthCheck.value.status = 'done'
    healthCheck.value.abortController = null
  }

  async function hideOfflineChannels(playlistId: number): Promise<void> {
    const offlineIds = channels.value
      .filter(ch => ch.playlistId === playlistId && ch.isOffline === true)
      .map(ch => ch.id!)
      .filter(id => id !== undefined)

    if (offlineIds.length === 0) return

    // Oculta da view reativa (não deleta do DB)
    channels.value = channels.value.filter(ch => !offlineIds.includes(ch.id!))

    // Remove dos recentes
    const historyStore = useHistoryStore()
    await historyStore.removeByChannelIds(offlineIds)

    // Limpa o selecionado se estiver offline
    if (selectedChannel.value && offlineIds.includes(selectedChannel.value.id!)) {
      selectedChannel.value = null
    }

    healthCheck.value.offlineCount = 0
  }

  return {
    playlists,
    channels,
    activePlaylist,
    selectedChannel,
    searchQuery,
    isLoading,
    error,
    healthCheck,
    filteredChannels,
    groupedChannels,
    loadPlaylists,
    loadChannels,
    selectPlaylist,
    selectChannel,
    importFromText,
    importFromUrl,
    deletePlaylist,
    updatePlaylist,
    runHealthCheck,
    stopHealthCheck,
    hideOfflineChannels,
  }
})
