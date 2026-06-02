import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db } from '@/database/db'
import { parseM3U, groupChannels, filterChannels } from '@/services/m3uParser'
import { prepareUrl, checkChannelUrl } from '@/services/stream'
import { useSettingsStore } from '@/stores/settings'
import { useHistoryStore } from '@/stores/history'
import type { Playlist, Channel, ChannelGroup } from '@/types'

// Timers de auto-refresh: fora do estado reativo para evitar proxying do Proxy
const refreshTimers = new Map<number, ReturnType<typeof setInterval>>()

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

  // ─── Import Progress State ─────────────────────────────────────────────────
  const IDLE_TIMEOUT_MS = 30_000

  const importProgress = ref<{
    status: 'idle' | 'downloading' | 'parsing' | 'saving'
    current: number
    total: number
  }>({ status: 'idle', current: 0, total: 0 })

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

  // ─── Auto-Refresh Helpers ────────────────────────────────────────────────────

  function stopRefreshTimer(playlistId: number): void {
    const existing = refreshTimers.get(playlistId)
    if (existing !== undefined) {
      clearInterval(existing)
      refreshTimers.delete(playlistId)
    }
  }

  function stopAllTimers(): void {
    refreshTimers.forEach((timer) => clearInterval(timer))
    refreshTimers.clear()
  }

  function startRefreshTimer(playlist: Playlist): void {
    if (playlist.source !== 'url' || !playlist.autoRefreshInterval || playlist.autoRefreshInterval <= 0) return
    stopRefreshTimer(playlist.id!)
    const timer = setInterval(() => refreshPlaylist(playlist.id!), playlist.autoRefreshInterval * 60_000)
    refreshTimers.set(playlist.id!, timer)
  }

  async function loadPlaylists() {
    const loaded = await db.playlists.toArray()
    playlists.value = loaded
    stopAllTimers()
    for (const pl of loaded) {
      if (pl.source === 'url' && pl.autoRefreshInterval > 0) {
        startRefreshTimer(pl)
      }
    }
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

  async function downloadWithProgress(url: string): Promise<string> {
    const controller = new AbortController()
    let idleTimer: ReturnType<typeof setTimeout> | null = null

    function resetIdleTimer() {
      if (idleTimer !== null) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => controller.abort('idle_timeout'), IDLE_TIMEOUT_MS)
    }

    try {
      resetIdleTimer()
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const contentLength = response.headers.get('Content-Length')
      const total = contentLength ? parseInt(contentLength, 10) : 0
      importProgress.value = { status: 'downloading', current: 0, total }
      const reader = response.body!.getReader()
      const chunks: Uint8Array[] = []
      let received = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        received += value.length
        importProgress.value.current = received
        resetIdleTimer()
      }
      const merged = new Uint8Array(received)
      let pos = 0
      for (const chunk of chunks) {
        merged.set(chunk, pos)
        pos += chunk.length
      }
      return new TextDecoder().decode(merged)
    } finally {
      if (idleTimer !== null) clearTimeout(idleTimer)
    }
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
        autoRefreshInterval: 0,
      })

      importProgress.value = { status: 'parsing', current: 0, total: 0 }
      const parsed = parseM3U(rawContent, playlistId as number)

      const BATCH_SIZE = 500
      importProgress.value = { status: 'saving', current: 0, total: parsed.length }
      for (let i = 0; i < parsed.length; i += BATCH_SIZE) {
        await db.channels.bulkAdd(parsed.slice(i, i + BATCH_SIZE))
        importProgress.value.current = Math.min(i + BATCH_SIZE, parsed.length)
      }

      await loadPlaylists()
      const created = playlists.value.find((p: Playlist) => p.id === playlistId)!
      return created
    } catch (e) {
      error.value = 'Erro ao importar lista.'
      throw e
    } finally {
      isLoading.value = false
      importProgress.value = { status: 'idle', current: 0, total: 0 }
    }
  }

  async function importFromUrl(url: string, name: string): Promise<Playlist> {
    isLoading.value = true
    error.value = null
    try {
      const finalUrl = prepareUrl(url, settingsStore.proxyEnabled && Boolean(settingsStore.proxyUrl), settingsStore.proxyUrl)
      const raw = await downloadWithProgress(finalUrl)
      return await importFromText(raw, name, 'url', url)
    } catch (e: unknown) {
      importProgress.value = { status: 'idle', current: 0, total: 0 }
      const isAbort = e instanceof DOMException && e.name === 'AbortError'
      error.value = isAbort
        ? 'Conexão lenta ou servidor parou de responder.'
        : 'Erro ao baixar a lista M3U.'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function refreshPlaylist(playlistId: number): Promise<void> {
    const playlist = playlists.value.find((p: Playlist) => p.id === playlistId)
    if (!playlist || playlist.source !== 'url') return
    isLoading.value = true
    error.value = null
    try {
      const finalUrl = prepareUrl(
        playlist.sourceValue,
        settingsStore.proxyEnabled && Boolean(settingsStore.proxyUrl),
        settingsStore.proxyUrl,
      )
      const raw = await downloadWithProgress(finalUrl)
      const now = new Date()
      const parsed = parseM3U(raw, playlistId)
      await db.channels.where('playlistId').equals(playlistId).delete()
      const BATCH_SIZE = 500
      for (let i = 0; i < parsed.length; i += BATCH_SIZE) {
        await db.channels.bulkAdd(parsed.slice(i, i + BATCH_SIZE))
      }
      await db.playlists.update(playlistId, { rawContent: raw, updatedAt: now, lastRefreshedAt: now })
      await loadPlaylists()
      if (activePlaylist.value?.id === playlistId) {
        await loadChannels(playlistId)
      }
    } catch (e) {
      error.value = 'Erro ao atualizar a lista M3U.'
      console.error(e)
    } finally {
      importProgress.value = { status: 'idle', current: 0, total: 0 }
      isLoading.value = false
    }
  }

  async function setRefreshInterval(playlistId: number, minutes: number): Promise<void> {
    await db.playlists.update(playlistId, { autoRefreshInterval: minutes })
    const idx = playlists.value.findIndex((p: Playlist) => p.id === playlistId)
    if (idx !== -1) {
      playlists.value[idx] = { ...playlists.value[idx], autoRefreshInterval: minutes }
    }
    stopRefreshTimer(playlistId)
    if (minutes > 0) {
      const playlist = playlists.value.find((p: Playlist) => p.id === playlistId)
      if (playlist) startRefreshTimer(playlist)
    }
  }

  async function deletePlaylist(id: number) {
    stopRefreshTimer(id)
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
    importProgress,
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
    refreshPlaylist,
    setRefreshInterval,
    runHealthCheck,
    stopHealthCheck,
    hideOfflineChannels,
  }
})
