import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db } from '@/database/db'
import { parseM3U, groupChannels, filterChannels } from '@/services/m3uParser'
import { prepareUrl } from '@/services/stream'
import { useSettingsStore } from '@/stores/settings'
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

  return {
    playlists,
    channels,
    activePlaylist,
    selectedChannel,
    searchQuery,
    isLoading,
    error,
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
  }
})
