<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import type Hls from 'hls.js'
import { usePlaylistStore } from '@/stores/playlist'
import { useSettingsStore } from '@/stores/settings'
import { useFavoritesStore } from '@/stores/favorites'
import { useHistoryStore } from '@/stores/history'
import { useEpgStore } from '@/stores/epg'
import { attachStream, destroyStream, isValidStreamUrl, isMixedContent } from '@/services/stream'
import { useI18n } from '@/i18n'
import type { Channel, ChannelGroup, HlsStats, EpgProgram } from '@/types'

const playlistStore = usePlaylistStore()
const settingsStore = useSettingsStore()
const favoritesStore = useFavoritesStore()
const historyStore = useHistoryStore()
const epgStore = useEpgStore()
const { t, tGroup } = useI18n()

// ─── Player ──────────────────────────────────────────────────────────────────
const videoEl = ref<HTMLVideoElement | null>(null)
const isLoading = ref(false)
const streamError = ref<string | null>(null)

// ─── Stats para nerds ─────────────────────────────────────────────────────────
const hlsRef = ref<Hls | null>(null)
const statsVisible = ref(false)
const stats = ref<HlsStats>({
  bitrate: 0,
  resolution: '-',
  bufferLength: 0,
  droppedFrames: 0,
  level: -1,
})
let statsInterval: ReturnType<typeof setInterval> | null = null

function startStatsPolling() {
  stopStatsPolling()
  statsInterval = setInterval(() => {
    if (!videoEl.value) return

    const buf = videoEl.value.buffered
    stats.value.bufferLength =
      buf.length > 0
        ? parseFloat((buf.end(buf.length - 1) - videoEl.value.currentTime).toFixed(1))
        : 0

    const q = videoEl.value.getVideoPlaybackQuality()
    stats.value.droppedFrames = q.droppedVideoFrames

    if (hlsRef.value && hlsRef.value.currentLevel >= 0) {
      const lvl = hlsRef.value.levels[hlsRef.value.currentLevel]
      if (lvl) {
        stats.value.bitrate = Math.round(lvl.bitrate / 1000)
        stats.value.resolution =
          lvl.width && lvl.height ? `${lvl.width}×${lvl.height}` : '-'
        stats.value.level = hlsRef.value.currentLevel
      }
    }
  }, 1000)
}

function stopStatsPolling() {
  if (statsInterval !== null) {
    clearInterval(statsInterval)
    statsInterval = null
  }
}

// ─── Seleção de qualidade ─────────────────────────────────────────────────────
interface QualityLevel { height?: number; width?: number; bitrate: number }
const availableLevels = ref<QualityLevel[]>([])
const selectedQuality = ref<number>(-1)

function onLevelsReady(levels: QualityLevel[]) {
  availableLevels.value = levels
}

function applyQuality(levelIndex: number) {
  selectedQuality.value = levelIndex
  if (hlsRef.value) {
    hlsRef.value.currentLevel = levelIndex
  }
}

function qualityLabel(lvl: QualityLevel, index: number): string {
  const res = lvl.height ? `${lvl.height}p` : `L${index}`
  const kbps = lvl.bitrate ? ` · ${Math.round(lvl.bitrate / 1000)}kbps` : ''
  return `${res}${kbps}`
}

// ─── Picture-in-Picture ─────────────────────────────────────────────────────
const isPiP = ref(false)
const pipSupported = typeof document !== 'undefined' && !!document.pictureInPictureEnabled

function onEnterPiP() { isPiP.value = true }
function onLeavePiP() { isPiP.value = false }

async function togglePiP() {
  if (!videoEl.value) return
  if (document.pictureInPictureElement) {
    await document.exitPictureInPicture()
  } else {
    await videoEl.value.requestPictureInPicture()
  }
}

// ─── EPG ─────────────────────────────────────────────────────────────────────
const epgPanelOpen = ref(false)
const currentNowProgram = ref<EpgProgram | null>(null)
const todayPrograms = ref<EpgProgram[]>([])
const currentProgramIds = ref<Map<string, EpgProgram>>(new Map())

async function loadCurrentProgram(tvgId: string) {
  if (!tvgId) {
    currentNowProgram.value = null
    return
  }
  currentNowProgram.value = await epgStore.getCurrentProgram(tvgId)
}

async function loadTodayPrograms(tvgId: string) {
  if (!tvgId) {
    todayPrograms.value = []
    return
  }
  todayPrograms.value = await epgStore.getProgramsForChannel(tvgId, new Date())
}

async function refreshCurrentPrograms() {
  const map = new Map<string, EpgProgram>()
  const now = new Date()
  const ids = await epgStore.getEpgChannelIds()
  // Buscar apenas canais que estão na lista atual e têm EPG
  const channels = playlistStore.channels.filter(
    (ch: Channel) => ch.tvgId && ids.has(ch.tvgId),
  )
  await Promise.all(
    channels.map(async (ch: Channel) => {
      const prog = await epgStore.getCurrentProgram(ch.tvgId)
      if (prog) map.set(ch.tvgId, prog)
    }),
  )
  // suppress unused warning for 'now' - used implicitly via getCurrentProgram
  void now
  currentProgramIds.value = map
}

watch(
  () => playlistStore.selectedChannel,
  async (ch) => {
    if (!ch) {
      currentNowProgram.value = null
      todayPrograms.value = []
      return
    }
    await loadCurrentProgram(ch.tvgId)
    if (epgPanelOpen.value) {
      await loadTodayPrograms(ch.tvgId)
    }
  },
)

watch(epgPanelOpen, async (open) => {
  if (open && playlistStore.selectedChannel) {
    await loadTodayPrograms(playlistStore.selectedChannel.tvgId)
  }
})

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function isNowProgram(prog: EpgProgram): boolean {
  const now = new Date()
  return prog.start <= now && prog.stop > now
}

function relativeTime(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 60) return 'agora'
  if (diff < 3600) return `${Math.floor(diff / 60)}min`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

// ─── Reprodução ──────────────────────────────────────────────────────────────
function playChannel(channel: Channel) {
  if (!videoEl.value) return
  streamError.value = null
  isLoading.value = true
  stopStatsPolling()
  availableLevels.value = []
  selectedQuality.value = -1
  stats.value = { bitrate: 0, resolution: '-', bufferLength: 0, droppedFrames: 0, level: -1 }
  playlistStore.selectChannel(channel)

  // Adicionar ao histórico
  if (playlistStore.activePlaylist?.id) {
    historyStore.addEntry(channel, playlistStore.activePlaylist.id)
  }

  if (!isValidStreamUrl(channel.url)) {
    isLoading.value = false
    streamError.value = t('player.stream.error.invalidUrl')
    return
  }

  if (isMixedContent(channel.url) && !settingsStore.proxyEnabled && !settingsStore.forceHttps) {
    isLoading.value = false
    streamError.value = t('player.stream.error.mixedContent')
    return
  }

  try {
    const hls = attachStream(
      videoEl.value,
      channel.url,
      settingsStore.proxyEnabled,
      settingsStore.proxyUrl,
      settingsStore.forceHttps,
      (msg) => {
        isLoading.value = false
        streamError.value = msg
      },
      onLevelsReady,
      () => {
        isLoading.value = false
        streamError.value = t('player.stream.error.autoplayBlocked')
      },
    )
    hlsRef.value = hls
    startStatsPolling()
  } catch {
    streamError.value = t('player.stream.error.init')
  }
}

function onVideoCanPlay() {
  isLoading.value = false
}
function onVideoError() {
  isLoading.value = false
  streamError.value = t('player.stream.error.playback')
}

// ─── Sidebar — abas ───────────────────────────────────────────────────────────
type SidebarTab = 'channels' | 'favorites' | 'history'
const activeTab = ref<SidebarTab>('channels')

const favoriteChannels = computed(() =>
  favoritesStore.getFavoriteChannels(playlistStore.channels),
)

// ─── Lista lateral ────────────────────────────────────────────────────────────
const sidebarOpen = ref(true)
const sidebarWidth = ref(288)
const isResizing = ref(false)
const expandedGroups = ref<Set<string>>(new Set())

function toggleGroup(name: string) {
  if (expandedGroups.value.has(name)) expandedGroups.value.delete(name)
  else expandedGroups.value.add(name)
}

function expandAll() {
  playlistStore.groupedChannels.forEach((g: ChannelGroup) => expandedGroups.value.add(g.name))
}

function collapseAll() {
  expandedGroups.value.clear()
}

function startResize(e: MouseEvent) {
  isResizing.value = true
  const startX = e.clientX
  const startWidth = sidebarWidth.value

  function onMove(ev: MouseEvent) {
    const delta = startX - ev.clientX
    sidebarWidth.value = Math.min(640, Math.max(160, startWidth + delta))
  }

  function onUp() {
    isResizing.value = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

watch(
  () => playlistStore.groupedChannels,
  (groups: ChannelGroup[]) => {
    groups.forEach((g) => expandedGroups.value.add(g.name))
  },
  { immediate: true },
)

// Atualiza programas EPG "agora" ao carregar canais
watch(
  () => playlistStore.channels,
  async () => {
    await refreshCurrentPrograms()
  },
)

// ─── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(async () => {
  await settingsStore.load()
  await playlistStore.loadPlaylists()
  await favoritesStore.loadFavorites()
  await historyStore.loadHistory()
  await epgStore.loadSources()
  if (settingsStore.lastPlaylistId) {
    const pl = playlistStore.playlists.find(
      (p: { id?: number }) => p.id === settingsStore.lastPlaylistId,
    )
    if (pl) await playlistStore.selectPlaylist(pl)
  }
})

watch(videoEl, (el, oldEl) => {
  if (oldEl) {
    oldEl.removeEventListener('enterpictureinpicture', onEnterPiP)
    oldEl.removeEventListener('leavepictureinpicture', onLeavePiP)
  }
  if (el) {
    el.addEventListener('enterpictureinpicture', onEnterPiP)
    el.addEventListener('leavepictureinpicture', onLeavePiP)
  }
})

onBeforeUnmount(() => {
  stopStatsPolling()
  if (videoEl.value) {
    videoEl.value.removeEventListener('enterpictureinpicture', onEnterPiP)
    videoEl.value.removeEventListener('leavepictureinpicture', onLeavePiP)
  }
  destroyStream(videoEl.value ?? undefined)
})


</script>

<template>
  <div class="flex h-[calc(100svh-3.5rem)] overflow-hidden bg-black">
    <!-- ── Área do Player ─────────────────────────────────────────── -->
    <div class="flex flex-col flex-1 min-w-0">
      <!-- Vídeo -->
      <div class="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
        <video
          ref="videoEl"
          class="w-full h-full object-contain"
          controls
          playsinline
          @canplay="onVideoCanPlay"
          @error="onVideoError"
        />

        <!-- Stats: botão de toggle -->
        <button
          v-if="playlistStore.selectedChannel"
          class="absolute top-3 left-3 z-10 bg-black/70 hover:bg-black/90 text-zinc-300 hover:text-white text-xs font-mono px-2.5 py-1 rounded-md transition-colors select-none"
          @click="statsVisible = !statsVisible"
        >
          {{ statsVisible ? t('player.stats.hide') : t('player.stats.show') }}
        </button>

        <!-- Stats: painel -->
        <div
          v-if="statsVisible && playlistStore.selectedChannel"
          class="absolute top-11 left-3 z-10 bg-black/85 border border-zinc-700/60 rounded-md text-xs font-mono p-3 space-y-1.5 min-w-48"
        >
          <p class="text-zinc-500 font-sans font-semibold uppercase tracking-wider text-[10px] mb-1.5 pb-1.5 border-b border-zinc-700/60">
            {{ t('player.stats.title') }}
          </p>
          <div class="flex justify-between gap-6">
            <span class="text-zinc-500">{{ t('player.stats.bitrate') }}</span>
            <span class="text-green-400">{{ stats.bitrate > 0 ? stats.bitrate + ' kbps' : '--' }}</span>
          </div>
          <div class="flex justify-between gap-6">
            <span class="text-zinc-500">{{ t('player.stats.resolution') }}</span>
            <span class="text-green-400">{{ stats.resolution }}</span>
          </div>
          <div class="flex justify-between gap-6">
            <span class="text-zinc-500">{{ t('player.stats.buffer') }}</span>
            <span class="text-green-400">{{ stats.bufferLength }}s</span>
          </div>
          <div class="flex justify-between gap-6">
            <span class="text-zinc-500">{{ t('player.stats.dropped') }}</span>
            <span :class="stats.droppedFrames > 0 ? 'text-yellow-400' : 'text-green-400'">
              {{ stats.droppedFrames }}
            </span>
          </div>
          <div v-if="stats.level >= 0" class="flex justify-between gap-6">
            <span class="text-zinc-500">{{ t('player.stats.quality') }}</span>
            <span class="text-green-400">{{ stats.level }}</span>
          </div>

          <!-- Seletor de qualidade inline nos stats -->
          <div v-if="availableLevels.length > 1" class="pt-1.5 border-t border-zinc-700/60">
            <p class="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">{{ t('player.quality.label') }}</p>
            <select
              :value="selectedQuality"
              class="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              @change="applyQuality(Number(($event.target as HTMLSelectElement).value))"
            >
              <option :value="-1">{{ t('player.quality.auto') }}</option>
              <option
                v-for="(lvl, i) in availableLevels"
                :key="i"
                :value="i"
              >{{ qualityLabel(lvl, i) }}</option>
            </select>
          </div>
        </div>

        <!-- Overlay: sem canal selecionado -->
        <div
          v-if="!playlistStore.selectedChannel"
          class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-600 select-none"
        >
          <svg class="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M15 10l4.553-2.069A1 1 0 0121 8.869v6.262a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
          <p class="text-sm">{{ t('player.empty') }}</p>
        </div>

        <!-- Overlay: carregando -->
        <div
          v-if="isLoading"
          class="absolute inset-0 flex items-center justify-center bg-black/60"
        >
          <svg class="w-10 h-10 text-indigo-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </div>

        <!-- Overlay: erro -->
        <div
          v-if="streamError"
          class="absolute bottom-4 left-1/2 -translate-x-1/2 bg-red-900/90 text-red-200 text-xs px-4 py-2 rounded-full"
        >
          {{ streamError }}
        </div>
      </div>

      <!-- Barra inferior: canal ativo -->
      <div
        v-if="playlistStore.selectedChannel"
        class="h-10 bg-zinc-900 border-t border-zinc-800 flex items-center px-4 gap-3 shrink-0"
      >
        <img
          v-if="playlistStore.selectedChannel.logo"
          :src="playlistStore.selectedChannel.logo"
          class="h-6 w-6 object-contain rounded"
          alt=""
        />
        <span class="text-sm text-zinc-200 truncate font-medium">
          {{ playlistStore.selectedChannel.name }}
        </span>
        <!-- Programa atual (EPG) -->
        <span v-if="currentNowProgram" class="text-xs text-zinc-500 truncate hidden sm:block">
          · {{ currentNowProgram.title }}
        </span>
        <div class="flex items-center gap-2 ml-auto shrink-0">
          <!-- Botão EPG -->
          <button
            v-if="playlistStore.selectedChannel.tvgId"
            class="text-xs px-2 py-0.5 rounded transition-colors"
            :class="epgPanelOpen
              ? 'bg-indigo-600 text-white'
              : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800'"
            @click="epgPanelOpen = !epgPanelOpen"
          >
            {{ t('player.epg.button') }}
          </button>
          <!-- Botão PiP -->
          <button
            v-if="pipSupported"
            class="text-xs px-2 py-0.5 rounded transition-colors"
            :class="isPiP
              ? 'bg-indigo-600 text-white'
              : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800'"
            :title="isPiP ? t('player.pip.exit') : t('player.pip.enter')"
            @click="togglePiP"
          >
            {{ isPiP ? t('player.pip.exit') : t('player.pip.enter') }}
          </button>
          <span class="text-xs text-zinc-600 truncate">{{ playlistStore.selectedChannel.group }}</span>
        </div>
      </div>

      <!-- Painel EPG -->
      <div
        v-if="epgPanelOpen && playlistStore.selectedChannel"
        class="bg-zinc-950 border-t border-zinc-800 overflow-y-auto shrink-0"
        style="max-height: 220px"
      >
        <div class="px-4 py-2 border-b border-zinc-800 flex items-center justify-between">
          <span class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{{ t('player.epg.schedule') }}</span>
          <button class="text-zinc-600 hover:text-zinc-300 text-xs" @click="epgPanelOpen = false">✕</button>
        </div>
        <div v-if="todayPrograms.length === 0" class="p-4 text-xs text-zinc-600 text-center">
          {{ epgStore.sources.length === 0 ? t('player.epg.noSources') : t('player.epg.noData') }}
        </div>
        <div v-else class="divide-y divide-zinc-800/50">
          <div
            v-for="prog in todayPrograms"
            :key="prog.id"
            class="flex items-start gap-3 px-4 py-2 text-xs"
            :class="isNowProgram(prog) ? 'bg-indigo-600/10 border-l-2 border-indigo-500' : 'border-l-2 border-transparent'"
          >
            <span class="text-zinc-500 shrink-0 w-10">{{ formatTime(prog.start) }}</span>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span
                  class="font-medium truncate"
                  :class="isNowProgram(prog) ? 'text-indigo-300' : 'text-zinc-300'"
                >{{ prog.title }}</span>
                <span
                  v-if="isNowProgram(prog)"
                  class="shrink-0 text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wide"
                >{{ t('player.epg.now') }}</span>
              </div>
              <p v-if="prog.description" class="text-zinc-600 truncate mt-0.5">{{ prog.description }}</p>
            </div>
            <span class="text-zinc-600 shrink-0">{{ formatTime(prog.stop) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Handle de resize da sidebar ───────────────────────────── -->
    <div
      v-if="sidebarOpen"
      class="w-1 shrink-0 cursor-col-resize group relative z-10"
      :class="isResizing ? 'bg-indigo-400' : 'bg-zinc-800 hover:bg-indigo-500'"
      style="transition: background-color 150ms"
      @mousedown.prevent="startResize"
    >
      <div class="absolute inset-y-0 left-1/2 -translate-x-1/2 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <span class="w-0.5 h-4 rounded-full bg-white/40" />
        <span class="w-0.5 h-4 rounded-full bg-white/40" />
      </div>
    </div>

    <!-- ── Sidebar: lista de canais ──────────────────────────────── -->
    <aside
      class="flex flex-col bg-zinc-900 border-l border-zinc-800 shrink-0 overflow-hidden"
      :style="sidebarOpen
        ? { width: sidebarWidth + 'px', transition: isResizing ? 'none' : 'width 300ms' }
        : { width: '2.5rem', transition: 'width 300ms' }"
    >
      <!-- Toggle sidebar -->
      <button
        class="h-10 flex items-center justify-center text-zinc-400 hover:text-white border-b border-zinc-800 shrink-0"
        :aria-label="sidebarOpen ? t('player.sidebar.close') : t('player.sidebar.open')"
        @click="sidebarOpen = !sidebarOpen"
      >
        <svg class="w-4 h-4 transition-transform" :class="sidebarOpen ? 'rotate-0' : 'rotate-180'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      <template v-if="sidebarOpen">
        <!-- Abas -->
        <div class="flex border-b border-zinc-800 shrink-0">
          <button
            v-for="tab in (['channels', 'favorites', 'history'] as const)"
            :key="tab"
            class="flex-1 py-2 text-xs font-medium transition-colors"
            :class="activeTab === tab
              ? 'text-indigo-400 border-b-2 border-indigo-500 -mb-px'
              : 'text-zinc-500 hover:text-zinc-300'"
            @click="activeTab = tab"
          >
            {{ tab === 'channels' ? t('player.tabs.channels') : tab === 'favorites' ? t('player.tabs.favorites') : t('player.tabs.history') }}
          </button>
        </div>

        <!-- ── ABA: CANAIS ──────────────────────────────────────── -->
        <template v-if="activeTab === 'channels'">
          <!-- Seletor de playlist -->
          <div class="px-3 pt-3 pb-2 border-b border-zinc-800 shrink-0">
            <select
              class="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              :value="playlistStore.activePlaylist?.id"
              @change="(e) => {
                const pl = playlistStore.playlists.find((p: { id?: number }) => p.id === Number((e.target as HTMLSelectElement).value))
                if (pl) playlistStore.selectPlaylist(pl)
              }"
            >
              <option value="" disabled :selected="!playlistStore.activePlaylist">
                {{ t('player.sidebar.selectPlaylist') }}
              </option>
              <option v-for="pl in playlistStore.playlists" :key="pl.id" :value="pl.id">
                {{ pl.name }}
              </option>
            </select>
          </div>

          <!-- Busca -->
          <div class="px-3 py-2 border-b border-zinc-800 shrink-0">
            <input
              v-model="playlistStore.searchQuery"
              type="search"
              :placeholder="t('player.sidebar.search')"
              class="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded px-2 py-1.5 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <!-- Expandir / Recolher todos os grupos -->
          <div
            v-if="settingsStore.groupingEnabled && playlistStore.groupedChannels.length > 0"
            class="px-3 py-1.5 border-b border-zinc-800 flex items-center justify-end gap-3 shrink-0"
          >
            <button class="text-xs text-zinc-500 hover:text-zinc-200 transition-colors" @click="expandAll">{{ t('player.sidebar.expandAll') }}</button>
            <span class="text-zinc-700 select-none">·</span>
            <button class="text-xs text-zinc-500 hover:text-zinc-200 transition-colors" @click="collapseAll">{{ t('player.sidebar.collapseAll') }}</button>
          </div>

          <!-- Lista de canais -->
          <div class="flex-1 overflow-y-auto">
            <p v-if="!playlistStore.activePlaylist" class="p-4 text-xs text-zinc-600 text-center">
              {{ t('player.sidebar.noPlaylist') }}
            </p>

            <!-- Agrupamento ativo -->
            <template v-else-if="settingsStore.groupingEnabled">
              <div v-for="group in playlistStore.groupedChannels" :key="group.name">
                <button
                  class="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
                  @click="toggleGroup(group.name)"
                >
                  <svg class="w-3 h-3 transition-transform shrink-0" :class="expandedGroups.has(group.name) ? 'rotate-90' : ''" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M7.293 4.707a1 1 0 011.414 0L14 10l-5.293 5.293a1 1 0 01-1.414-1.414L11.586 10 6.293 5.121a1 1 0 010-1.414z"/>
                  </svg>
                  <span class="truncate flex-1 text-left">{{ tGroup(group.name) }}</span>
                  <span class="text-zinc-700 font-normal normal-case tracking-normal">{{ group.channels.length }}</span>
                </button>
                <div v-show="expandedGroups.has(group.name)">
                  <div
                    v-for="ch in group.channels"
                    :key="ch.id"
                    class="w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors cursor-pointer"
                    :class="playlistStore.selectedChannel?.id === ch.id
                      ? 'bg-indigo-600/20 text-indigo-300 border-l-2 border-indigo-500'
                      : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 border-l-2 border-transparent'"
                    @click="playChannel(ch)"
                  >
                    <img v-if="ch.logo" :src="ch.logo" class="w-5 h-5 object-contain rounded shrink-0" alt="" />
                    <div v-else class="w-5 h-5 bg-zinc-700 rounded shrink-0" />
                    <div class="flex-1 min-w-0">
                      <div class="truncate">{{ ch.name }}</div>
                      <div v-if="ch.tvgId && currentProgramIds.get(ch.tvgId)" class="text-[10px] text-zinc-600 truncate">
                        {{ currentProgramIds.get(ch.tvgId)?.title }}
                      </div>
                    </div>
                    <!-- Botão favorito -->
                    <button
                      class="shrink-0 text-base leading-none transition-colors"
                      :class="favoritesStore.isFavorite(ch.id!) ? 'text-yellow-400' : 'text-zinc-700 hover:text-zinc-400'"
                      :aria-label="favoritesStore.isFavorite(ch.id!) ? 'Remover favorito' : 'Adicionar favorito'"
                      @click.stop="favoritesStore.toggleFavorite(ch)"
                    >{{ favoritesStore.isFavorite(ch.id!) ? '★' : '☆' }}</button>
                  </div>
                </div>
              </div>
            </template>

            <!-- Lista plana -->
            <template v-else>
              <div
                v-for="ch in playlistStore.filteredChannels"
                :key="ch.id"
                class="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer"
                :class="playlistStore.selectedChannel?.id === ch.id
                  ? 'bg-indigo-600/20 text-indigo-300 border-l-2 border-indigo-500'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 border-l-2 border-transparent'"
                @click="playChannel(ch)"
              >
                <img v-if="ch.logo" :src="ch.logo" class="w-5 h-5 object-contain rounded shrink-0" alt="" />
                <div v-else class="w-5 h-5 bg-zinc-700 rounded shrink-0" />
                <div class="flex-1 min-w-0">
                  <div class="truncate">{{ ch.name }}</div>
                  <div v-if="ch.tvgId && currentProgramIds.get(ch.tvgId)" class="text-[10px] text-zinc-600 truncate">
                    {{ currentProgramIds.get(ch.tvgId)?.title }}
                  </div>
                </div>
                <button
                  class="shrink-0 text-base leading-none transition-colors"
                  :class="favoritesStore.isFavorite(ch.id!) ? 'text-yellow-400' : 'text-zinc-700 hover:text-zinc-400'"
                  @click.stop="favoritesStore.toggleFavorite(ch)"
                >{{ favoritesStore.isFavorite(ch.id!) ? '★' : '☆' }}</button>
              </div>
            </template>
          </div>
        </template>

        <!-- ── ABA: FAVORITOS ───────────────────────────────────── -->
        <template v-else-if="activeTab === 'favorites'">
          <div class="flex-1 overflow-y-auto">
            <p v-if="favoriteChannels.length === 0" class="p-4 text-xs text-zinc-600 text-center whitespace-pre-line">
              {{ t('player.favorites.empty') }}
            </p>
            <template v-else>
              <div
                v-for="ch in favoriteChannels"
                :key="ch.id"
                class="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer"
                :class="playlistStore.selectedChannel?.id === ch.id
                  ? 'bg-indigo-600/20 text-indigo-300 border-l-2 border-indigo-500'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 border-l-2 border-transparent'"
                @click="playChannel(ch)"
              >
                <img v-if="ch.logo" :src="ch.logo" class="w-5 h-5 object-contain rounded shrink-0" alt="" />
                <div v-else class="w-5 h-5 bg-zinc-700 rounded shrink-0" />
                <span class="truncate flex-1">{{ ch.name }}</span>
                <button
                  class="shrink-0 text-base text-yellow-400 leading-none"
                  @click.stop="favoritesStore.toggleFavorite(ch)"
                >★</button>
              </div>
            </template>
          </div>
        </template>

        <!-- ── ABA: RECENTES ────────────────────────────────────── -->
        <template v-else-if="activeTab === 'history'">
          <div class="flex-1 overflow-y-auto">
            <div v-if="historyStore.entries.length > 0" class="px-3 py-1.5 border-b border-zinc-800 flex justify-end">
              <button
                class="text-xs text-zinc-600 hover:text-red-400 transition-colors"
                @click="historyStore.clearHistory()"
              >{{ t('player.history.clear') }}</button>
            </div>
            <p v-if="historyStore.entries.length === 0" class="p-4 text-xs text-zinc-600 text-center">
              {{ t('player.history.empty') }}
            </p>
            <template v-else>
              <button
                v-for="entry in historyStore.entries"
                :key="entry.id"
                class="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors"
                :class="playlistStore.selectedChannel?.id === entry.channelId
                  ? 'bg-indigo-600/20 text-indigo-300 border-l-2 border-indigo-500'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 border-l-2 border-transparent'"
                @click="() => {
                  const ch = playlistStore.channels.find((c: Channel) => c.id === entry.channelId)
                  if (ch) playChannel(ch)
                }"
              >
                <img v-if="entry.channelLogo" :src="entry.channelLogo" class="w-5 h-5 object-contain rounded shrink-0" alt="" />
                <div v-else class="w-5 h-5 bg-zinc-700 rounded shrink-0" />
                <div class="flex-1 min-w-0">
                  <div class="truncate">{{ entry.channelName }}</div>
                  <div class="text-[10px] text-zinc-600">{{ entry.channelGroup }}</div>
                </div>
                <span class="shrink-0 text-[10px] text-zinc-600">{{ relativeTime(entry.watchedAt) }}</span>
              </button>
            </template>
          </div>
        </template>
      </template>
    </aside>
  </div>
</template>

