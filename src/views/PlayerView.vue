<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import type Hls from 'hls.js'
import { usePlaylistStore } from '@/stores/playlist'
import { useSettingsStore } from '@/stores/settings'
import { attachStream, destroyStream } from '@/services/stream'
import type { Channel, ChannelGroup, HlsStats } from '@/types'

const playlistStore = usePlaylistStore()
const settingsStore = useSettingsStore()

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

    // Buffer restante à frente do playhead
    const buf = videoEl.value.buffered
    stats.value.bufferLength =
      buf.length > 0
        ? parseFloat((buf.end(buf.length - 1) - videoEl.value.currentTime).toFixed(1))
        : 0

    // Frames perdidos (WebAPI)
    const q = videoEl.value.getVideoPlaybackQuality()
    stats.value.droppedFrames = q.droppedVideoFrames

    // Bitrate e resolução do nível HLS atual
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
function playChannel(channel: Channel) {
  if (!videoEl.value) return
  streamError.value = null
  isLoading.value = true
  stopStatsPolling()
  stats.value = { bitrate: 0, resolution: '-', bufferLength: 0, droppedFrames: 0, level: -1 }
  playlistStore.selectChannel(channel)
  try {
    const hls = attachStream(
      videoEl.value,
      channel.url,
      settingsStore.proxyEnabled ? settingsStore.proxyUrl : '',
      (msg) => {
        isLoading.value = false
        streamError.value = msg
      },
    )
    hlsRef.value = hls
    startStatsPolling()
  } catch {
    streamError.value = 'Falha ao inicializar o stream.'
  }
}

function onVideoCanPlay() {
  isLoading.value = false
}
function onVideoError() {
  isLoading.value = false
  streamError.value = 'Erro ao reproduzir o stream. Verifique a URL ou configure um proxy.'
}

// ─── Lista lateral ────────────────────────────────────────────────────────────
const sidebarOpen = ref(true)
const sidebarWidth = ref(288) // px — equivale a w-72
const isResizing = ref(false)
const expandedGroups = ref<Set<string>>(new Set())

function toggleGroup(name: string) {
  if (expandedGroups.value.has(name)) expandedGroups.value.delete(name)
  else expandedGroups.value.add(name)
}

function expandAll() {
  playlistStore.groupedChannels.forEach(g => expandedGroups.value.add(g.name))
}

function collapseAll() {
  expandedGroups.value.clear()
}

function startResize(e: MouseEvent) {
  isResizing.value = true
  const startX = e.clientX
  const startWidth = sidebarWidth.value

  function onMove(ev: MouseEvent) {
    const delta = startX - ev.clientX // arrastar à esquerda = aumentar
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

// Expande todos os grupos ao carregar
watch(
  () => playlistStore.groupedChannels,
  (groups: ChannelGroup[]) => {
    groups.forEach((g) => expandedGroups.value.add(g.name))
  },
  { immediate: true },
)

// ─── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(async () => {
  await settingsStore.load()
  await playlistStore.loadPlaylists()
  if (settingsStore.lastPlaylistId) {
    const pl = playlistStore.playlists.find(
      (p: { id?: number }) => p.id === settingsStore.lastPlaylistId,
    )
    if (pl) await playlistStore.selectPlaylist(pl)
  }
})

onBeforeUnmount(() => {
  stopStatsPolling()
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
          {{ statsVisible ? '✕ Stats' : '📊 Stats' }}
        </button>

        <!-- Stats: painel "estatísticas para nerds" -->
        <div
          v-if="statsVisible && playlistStore.selectedChannel"
          class="absolute top-11 left-3 z-10 bg-black/85 border border-zinc-700/60 rounded-md text-xs font-mono p-3 space-y-1.5 min-w-48"
        >
          <p class="text-zinc-500 font-sans font-semibold uppercase tracking-wider text-[10px] mb-1.5 pb-1.5 border-b border-zinc-700/60">
            Estatísticas
          </p>
          <div class="flex justify-between gap-6">
            <span class="text-zinc-500">Bitrate</span>
            <span class="text-green-400">{{ stats.bitrate > 0 ? stats.bitrate + ' kbps' : '--' }}</span>
          </div>
          <div class="flex justify-between gap-6">
            <span class="text-zinc-500">Resolução</span>
            <span class="text-green-400">{{ stats.resolution }}</span>
          </div>
          <div class="flex justify-between gap-6">
            <span class="text-zinc-500">Buffer</span>
            <span class="text-green-400">{{ stats.bufferLength }}s</span>
          </div>
          <div class="flex justify-between gap-6">
            <span class="text-zinc-500">Frames perdidos</span>
            <span :class="stats.droppedFrames > 0 ? 'text-yellow-400' : 'text-green-400'">
              {{ stats.droppedFrames }}
            </span>
          </div>
          <div v-if="stats.level >= 0" class="flex justify-between gap-6">
            <span class="text-zinc-500">Nível Q.</span>
            <span class="text-green-400">{{ stats.level }}</span>
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
          <p class="text-sm">Selecione um canal para reproduzir</p>
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
        <span class="text-xs text-zinc-500 ml-auto truncate">
          {{ playlistStore.selectedChannel.group }}
        </span>
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
      <!-- grip visual centralizado -->
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
        :aria-label="sidebarOpen ? 'Fechar lista' : 'Abrir lista'"
        @click="sidebarOpen = !sidebarOpen"
      >
        <svg class="w-4 h-4 transition-transform" :class="sidebarOpen ? 'rotate-0' : 'rotate-180'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      <template v-if="sidebarOpen">
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
              Selecione uma lista
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
            placeholder="Buscar canal..."
            class="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded px-2 py-1.5 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <!-- Expandir / Recolher todos os grupos -->
        <div
          v-if="settingsStore.groupingEnabled && playlistStore.groupedChannels.length > 0"
          class="px-3 py-1.5 border-b border-zinc-800 flex items-center justify-end gap-3 shrink-0"
        >
          <button
            class="text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
            @click="expandAll"
          >Expandir todos</button>
          <span class="text-zinc-700 select-none">·</span>
          <button
            class="text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
            @click="collapseAll"
          >Recolher todos</button>
        </div>

        <!-- Lista com agrupamento -->
        <div class="flex-1 overflow-y-auto">
          <!-- Sem playlist -->
          <p v-if="!playlistStore.activePlaylist" class="p-4 text-xs text-zinc-600 text-center">
            Nenhuma lista selecionada.
          </p>

          <!-- Agrupamento ativo -->
          <template v-else-if="settingsStore.groupingEnabled">
            <div
              v-for="group in playlistStore.groupedChannels"
              :key="group.name"
            >
              <!-- Cabeçalho do grupo -->
              <button
                class="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
                @click="toggleGroup(group.name)"
              >
                <svg
                  class="w-3 h-3 transition-transform shrink-0"
                  :class="expandedGroups.has(group.name) ? 'rotate-90' : ''"
                  fill="currentColor" viewBox="0 0 20 20"
                >
                  <path d="M7.293 4.707a1 1 0 011.414 0L14 10l-5.293 5.293a1 1 0 01-1.414-1.414L11.586 10 6.293 5.121a1 1 0 010-1.414z"/>
                </svg>
                <span class="truncate flex-1 text-left">{{ group.name }}</span>
                <span class="text-zinc-700 font-normal normal-case tracking-normal">{{ group.channels.length }}</span>
              </button>

              <!-- Canais do grupo -->
              <div v-show="expandedGroups.has(group.name)">
                <button
                  v-for="ch in group.channels"
                  :key="ch.id"
                  class="w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors"
                  :class="
                    playlistStore.selectedChannel?.id === ch.id
                      ? 'bg-indigo-600/20 text-indigo-300 border-l-2 border-indigo-500'
                      : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 border-l-2 border-transparent'
                  "
                  @click="playChannel(ch)"
                >
                  <img
                    v-if="ch.logo"
                    :src="ch.logo"
                    class="w-5 h-5 object-contain rounded shrink-0"
                    alt=""
                  />
                  <div v-else class="w-5 h-5 bg-zinc-700 rounded shrink-0" />
                  <span class="truncate">{{ ch.name }}</span>
                </button>
              </div>
            </div>
          </template>

          <!-- Lista plana (agrupamento desativado) -->
          <template v-else>
            <button
              v-for="ch in playlistStore.filteredChannels"
              :key="ch.id"
              class="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors"
              :class="
                playlistStore.selectedChannel?.id === ch.id
                  ? 'bg-indigo-600/20 text-indigo-300 border-l-2 border-indigo-500'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 border-l-2 border-transparent'
              "
              @click="playChannel(ch)"
            >
              <img
                v-if="ch.logo"
                :src="ch.logo"
                class="w-5 h-5 object-contain rounded shrink-0"
                alt=""
              />
              <div v-else class="w-5 h-5 bg-zinc-700 rounded shrink-0" />
              <span class="truncate">{{ ch.name }}</span>
            </button>
          </template>
        </div>
      </template>
    </aside>
  </div>
</template>
