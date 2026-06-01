<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import type Hls from 'hls.js'
import { usePlaylistStore } from '@/stores/playlist'
import { useSettingsStore } from '@/stores/settings'
import { useFavoritesStore } from '@/stores/favorites'
import { useHistoryStore } from '@/stores/history'
import { useEpgStore } from '@/stores/epg'
import { attachStream, destroyStream, isValidStreamUrl } from '@/services/stream'
import { useI18n } from '@/i18n'
import type { Channel, HlsStats, EpgProgram } from '@/types'
import FloatingChannelPanel from '@/components/player/FloatingChannelPanel.vue'

const playlistStore = usePlaylistStore()
const settingsStore = useSettingsStore()
const favoritesStore = useFavoritesStore()
const historyStore = useHistoryStore()
const epgStore = useEpgStore()
const { t } = useI18n()

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

  // if (isMixedContent(channel.url) && !settingsStore.proxyEnabled && !settingsStore.forceHttps) {
  //   isLoading.value = false
  //   streamError.value = t('player.stream.error.mixedContent')
  //   return
  // }

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
          <!-- Botão Stats -->
          <div class="relative flex items-center">
            <button
              class="text-xs px-2 py-0.5 rounded transition-colors"
              :class="statsVisible
                ? 'bg-indigo-600 text-white'
                : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800'"
              @click="statsVisible = !statsVisible"
            >
              {{ t('player.stats.show') }}
            </button>
            <!-- Stats: painel flutuante -->
            <div
              v-if="statsVisible"
              class="absolute bottom-full mb-2 right-0 z-20 bg-zinc-900/95 border border-zinc-700/60 rounded-md text-xs font-mono p-3 space-y-1.5 min-w-48"
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
          </div>
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

    <!-- ── Painel flutuante de canais ────────────────────────────── -->
    <FloatingChannelPanel
      :currentProgramIds="currentProgramIds"
      @play-channel="playChannel"
    />
  </div>
</template>

