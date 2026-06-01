<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { usePlaylistStore } from '@/stores/playlist'
import { useSettingsStore } from '@/stores/settings'
import { useFavoritesStore } from '@/stores/favorites'
import { useHistoryStore } from '@/stores/history'
import { useI18n } from '@/i18n'
import type { Channel, ChannelGroup, EpgProgram } from '@/types'

// ─── Props & Emits ────────────────────────────────────────────────────────────
const props = defineProps<{
  currentProgramIds: Map<string, EpgProgram>
}>()

const emit = defineEmits<{
  'play-channel': [channel: Channel]
}>()

// ─── Stores ───────────────────────────────────────────────────────────────────
const playlistStore = usePlaylistStore()
const settingsStore = useSettingsStore()
const favoritesStore = useFavoritesStore()
const historyStore = useHistoryStore()
const { t, tGroup } = useI18n()

// ─── Refs DOM ─────────────────────────────────────────────────────────────────
const btnEl = ref<HTMLElement | null>(null)
const panelEl = ref<HTMLElement | null>(null)

// ─── Persistência: helpers ────────────────────────────────────────────────────
function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}
function lsSet(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* noop */ }
}

// ─── Posição do botão ─────────────────────────────────────────────────────────
function defaultPos() {
  return {
    x: window.innerWidth - 60,
    y: 16,
  }
}

const pos = ref<{ x: number; y: number }>(lsGet('iptv-panel-pos', { x: -1, y: -1 }))

function clampPos(x: number, y: number) {
  const btnW = 40, btnH = 40
  return {
    x: Math.max(0, Math.min(window.innerWidth - btnW, x)),
    y: Math.max(0, Math.min(window.innerHeight - btnH, y)),
  }
}

// ─── Estado do painel ─────────────────────────────────────────────────────────
const isOpen = ref<boolean>(lsGet('iptv-panel-open', true))
const panelWidth = ref<number>(lsGet('iptv-panel-width', 288))

type SidebarTab = 'channels' | 'favorites' | 'history'
const activeTab = ref<SidebarTab>(lsGet<SidebarTab>('iptv-panel-tab', 'channels'))
const expandedGroups = ref<Set<string>>(new Set(lsGet<string[]>('iptv-panel-groups', [])))
const searchQuery = ref<string>(lsGet('iptv-panel-search', ''))

// Sync searchQuery ↔ playlistStore.searchQuery
watch(searchQuery, (v) => {
  playlistStore.searchQuery = v
  lsSet('iptv-panel-search', v)
})
watch(() => playlistStore.searchQuery, (v) => {
  if (v !== searchQuery.value) searchQuery.value = v
})

// ─── Grupos ───────────────────────────────────────────────────────────────────
function toggleGroup(name: string) {
  if (expandedGroups.value.has(name)) expandedGroups.value.delete(name)
  else expandedGroups.value.add(name)
  lsSet('iptv-panel-groups', [...expandedGroups.value])
}

function expandAll() {
  playlistStore.groupedChannels.forEach((g: ChannelGroup) => expandedGroups.value.add(g.name))
  lsSet('iptv-panel-groups', [...expandedGroups.value])
}

function collapseAll() {
  expandedGroups.value.clear()
  lsSet('iptv-panel-groups', [])
}

// Ao carregar nova playlist: expande grupos novos sem limpar os existentes
watch(
  () => playlistStore.groupedChannels,
  (groups: ChannelGroup[]) => {
    groups.forEach((g) => expandedGroups.value.add(g.name))
    lsSet('iptv-panel-groups', [...expandedGroups.value])
  },
  { immediate: true },
)

// ─── Favoritos ────────────────────────────────────────────────────────────────
const favoriteChannels = computed(() =>
  favoritesStore.getFavoriteChannels(playlistStore.channels),
)

// ─── Drag do botão (Pointer Events) ──────────────────────────────────────────
const isDragging = ref(false)
let dragStartX = 0
let dragStartY = 0
let dragStartPosX = 0
let dragStartPosY = 0
let dragMoved = false

function onBtnPointerDown(e: PointerEvent) {
  if (e.button !== 0 && e.pointerType === 'mouse') return
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  dragStartX = e.clientX
  dragStartY = e.clientY
  dragStartPosX = pos.value.x
  dragStartPosY = pos.value.y
  dragMoved = false
  isDragging.value = true
  e.preventDefault()
}

function onBtnPointerMove(e: PointerEvent) {
  if (!isDragging.value) return
  const dx = e.clientX - dragStartX
  const dy = e.clientY - dragStartY
  if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragMoved = true
  if (dragMoved) {
    const clamped = clampPos(dragStartPosX + dx, dragStartPosY + dy)
    pos.value = clamped
  }
}

function onBtnPointerUp(e: PointerEvent) {
  if (!isDragging.value) return
  isDragging.value = false
  const dx = e.clientX - dragStartX
  const dy = e.clientY - dragStartY
  const delta = Math.sqrt(dx * dx + dy * dy)
  if (delta < 5) {
    // é click → toggle
    isOpen.value = !isOpen.value
    lsSet('iptv-panel-open', isOpen.value)
  } else {
    // é drag → salva posição
    lsSet('iptv-panel-pos', pos.value)
  }
}

// ─── Resize do painel ─────────────────────────────────────────────────────────
let resizingPanel = false
let resizeStartX = 0
let resizeStartWidth = 0

function onResizePointerDown(e: PointerEvent) {
  resizingPanel = true
  resizeStartX = e.clientX
  resizeStartWidth = panelWidth.value
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  e.preventDefault()
}

function onResizePointerMove(e: PointerEvent) {
  if (!resizingPanel) return
  // painel abre à esquerda → arrastar handle à esquerda aumenta largura
  const openLeft = pos.value.x > window.innerWidth / 2
  const dx = openLeft
    ? resizeStartX - e.clientX
    : e.clientX - resizeStartX
  panelWidth.value = Math.max(288, resizeStartWidth + dx)
}

function onResizePointerUp() {
  if (!resizingPanel) return
  resizingPanel = false
  lsSet('iptv-panel-width', panelWidth.value)
}

// ─── Posicionamento do painel ─────────────────────────────────────────────────
const panelStyle = computed(() => {
  const btnW = 40
  const btnH = 40
  const margin = 8
  const openLeft = pos.value.x > window.innerWidth / 2
  const openUp = pos.value.y > window.innerHeight / 2

  const style: Record<string, string> = {
    position: 'fixed',
    zIndex: '49',
    width: panelWidth.value + 'px',
    maxHeight: '70vh',
  }

  // Horizontal
  if (openLeft) {
    style.right = (window.innerWidth - pos.value.x) + 'px'
  } else {
    style.left = (pos.value.x + btnW + margin) + 'px'
  }

  // Vertical
  if (openUp) {
    style.bottom = (window.innerHeight - pos.value.y - btnH) + 'px'
  } else {
    style.top = pos.value.y + 'px'
  }

  return style
})

const resizeHandleSide = computed(() =>
  pos.value.x > window.innerWidth / 2 ? 'left' : 'right',
)

// ─── Fechar ao clicar fora ────────────────────────────────────────────────────
function onDocPointerDown(e: PointerEvent) {
  if (!isOpen.value) return
  const target = e.target as Node
  if (
    (btnEl.value && btnEl.value.contains(target)) ||
    (panelEl.value && panelEl.value.contains(target))
  ) return
  isOpen.value = false
  lsSet('iptv-panel-open', false)
}

// ─── Salvar tab ───────────────────────────────────────────────────────────────
watch(activeTab, (v) => lsSet('iptv-panel-tab', v))

// ─── Tempo relativo ─────────────────────────────────────────────────────────
function relativeTime(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 60) return 'agora'
  if (diff < 3600) return `${Math.floor(diff / 60)}min`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(() => {
  // Se posição não foi salva ainda, usa padrão
  if (pos.value.x === -1) {
    pos.value = defaultPos()
  } else {
    // Garante que a posição salva ainda está dentro da viewport atual
    pos.value = clampPos(pos.value.x, pos.value.y)
  }
  document.addEventListener('pointerdown', onDocPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown)
})

// Recalcular posição ao redimensionar janela
function onWindowResize() {
  pos.value = clampPos(pos.value.x, pos.value.y)
}

onMounted(() => window.addEventListener('resize', onWindowResize))
onBeforeUnmount(() => window.removeEventListener('resize', onWindowResize))
</script>

<template>
  <!-- Botão flutuante (toggle + drag handle) -->
  <div
    ref="btnEl"
    class="fixed z-50 select-none"
    :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
  >
    <button
      class="w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-colors"
      :class="[
        isDragging ? 'cursor-grabbing' : 'cursor-grab',
        isOpen
          ? 'bg-indigo-600 text-white'
          : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white',
      ]"
      :aria-label="isOpen ? t('player.sidebar.close') : t('player.sidebar.open')"
      style="touch-action: none"
      @pointerdown="onBtnPointerDown"
      @pointermove="onBtnPointerMove"
      @pointerup="onBtnPointerUp"
    >
      <!-- Ícone lista -->
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  </div>

  <!-- Painel -->
  <Transition name="panel">
    <div
      v-if="isOpen"
      ref="panelEl"
      class="fixed flex flex-col bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl overflow-hidden"
      :style="panelStyle"
    >
      <!-- Handle de resize -->
      <div
        class="absolute top-0 bottom-0 w-1.5 z-10 cursor-col-resize hover:bg-indigo-500/40 transition-colors"
        :class="resizeHandleSide === 'left' ? 'left-0' : 'right-0'"
        style="touch-action: none"
        @pointerdown="onResizePointerDown"
        @pointermove="onResizePointerMove"
        @pointerup="onResizePointerUp"
      />

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

      <!-- ── ABA: CANAIS ──────────────────────────────────────────────── -->
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
            v-model="searchQuery"
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
          <button class="text-xs text-zinc-500 hover:text-zinc-200 transition-colors" @click="expandAll">
            {{ t('player.sidebar.expandAll') }}
          </button>
          <span class="text-zinc-700 select-none">·</span>
          <button class="text-xs text-zinc-500 hover:text-zinc-200 transition-colors" @click="collapseAll">
            {{ t('player.sidebar.collapseAll') }}
          </button>
        </div>

        <!-- Lista de canais -->
        <div class="flex-1 overflow-y-auto min-h-0">
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
                <svg
                  class="w-3 h-3 transition-transform shrink-0"
                  :class="expandedGroups.has(group.name) ? 'rotate-90' : ''"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
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
                  @click="emit('play-channel', ch)"
                >
                  <img v-if="ch.logo" :src="ch.logo" class="w-5 h-5 object-contain rounded shrink-0" alt="" />
                  <div v-else class="w-5 h-5 bg-zinc-700 rounded shrink-0" />
                  <div class="flex-1 min-w-0">
                    <div class="truncate">{{ ch.name }}</div>
                    <div v-if="ch.tvgId && props.currentProgramIds.get(ch.tvgId)" class="text-[10px] text-zinc-600 truncate">
                      {{ props.currentProgramIds.get(ch.tvgId)?.title }}
                    </div>
                  </div>
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
              @click="emit('play-channel', ch)"
            >
              <img v-if="ch.logo" :src="ch.logo" class="w-5 h-5 object-contain rounded shrink-0" alt="" />
              <div v-else class="w-5 h-5 bg-zinc-700 rounded shrink-0" />
              <div class="flex-1 min-w-0">
                <div class="truncate">{{ ch.name }}</div>
                <div v-if="ch.tvgId && props.currentProgramIds.get(ch.tvgId)" class="text-[10px] text-zinc-600 truncate">
                  {{ props.currentProgramIds.get(ch.tvgId)?.title }}
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

      <!-- ── ABA: FAVORITOS ────────────────────────────────────────────── -->
      <template v-else-if="activeTab === 'favorites'">
        <div class="flex-1 overflow-y-auto min-h-0">
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
              @click="emit('play-channel', ch)"
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

      <!-- ── ABA: RECENTES ─────────────────────────────────────────────── -->
      <template v-else-if="activeTab === 'history'">
        <div class="flex-1 overflow-y-auto min-h-0">
          <div v-if="historyStore.entries.length > 0" class="px-3 py-1.5 border-b border-zinc-800 flex justify-end shrink-0">
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
                if (ch) emit('play-channel', ch)
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
    </div>
  </Transition>
</template>

<style scoped>
.panel-enter-active,
.panel-leave-active {
  transition: opacity 150ms ease, transform 150ms ease;
}
.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: scale(0.97);
}
</style>
