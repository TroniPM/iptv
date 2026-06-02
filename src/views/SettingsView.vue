<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { usePlaylistStore } from '@/stores/playlist'
import { useSettingsStore } from '@/stores/settings'
import { useEpgStore } from '@/stores/epg'
import { useI18n, LOCALES } from '@/i18n'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppToggle from '@/components/ui/AppToggle.vue'
import { db } from '@/database/db'
import type { Playlist, Channel } from '@/types'

const playlistStore = usePlaylistStore()
const settingsStore = useSettingsStore()
const epgStore = useEpgStore()
const { t, tParam, locale } = useI18n()

// ─── Idioma ───────────────────────────────────────────────────────────────────
const savedVisible = ref(false)
let savedTimer: ReturnType<typeof setTimeout> | null = null

async function selectLanguage(code: string) {
  await settingsStore.setLanguage(code)
  showSaved()
}

function showSaved() {
  if (savedTimer !== null) clearTimeout(savedTimer)
  savedVisible.value = true
  savedTimer = setTimeout(() => {
    savedVisible.value = false
    savedTimer = null
  }, 2000)
}

// ─── Diversos ────────────────────────────────────────────────────────────────
const proxyDraft = ref('')

async function saveProxy() {
  await settingsStore.save({ proxyUrl: proxyDraft.value.trim() })
}

// ─── Detecção de browser ──────────────────────────────────────────────────────
const isEdge = navigator.userAgent.includes('Edg/')
const isChrome = !isEdge && navigator.userAgent.includes('Chrome')
const insecureContentUrl = isEdge
  ? 'edge://settings/privacy/sitePermissions/allSites/siteDetails?site=https%3A%2F%2Ftronipm.github.io'
  : 'chrome://settings/content/siteDetails?site=https%3A%2F%2Ftronipm.github.io'
const copySuccess = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null

function copyInsecureUrl() {
  navigator.clipboard.writeText(insecureContentUrl).then(() => {
    if (copyTimer) clearTimeout(copyTimer)
    copySuccess.value = true
    copyTimer = setTimeout(() => { copySuccess.value = false }, 2000)
  })
}

// ─── Modal de importação ──────────────────────────────────────────────────────
const showImportModal = ref(false)
const importTab = ref<'url' | 'file'>('url')
const importName = ref('')
const importUrl = ref('')
const importText = ref('')
const importError = ref<string | null>(null)

function openImport() {
  importTab.value = 'url'
  importName.value = ''
  importUrl.value = ''
  importText.value = ''
  importError.value = null
  showImportModal.value = true
}

async function handleFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  importText.value = await file.text()
  if (!importName.value) importName.value = file.name.replace(/\.[^.]+$/, '')
}

async function submitImport() {
  importError.value = null
  if (!importName.value.trim()) {
    importError.value = t('manage.error.noName')
    return
  }
  try {
    if (importTab.value === 'url') {
      if (!importUrl.value.trim()) {
        importError.value = t('manage.error.noUrl')
        return
      }
      await playlistStore.importFromUrl(importUrl.value.trim(), importName.value.trim())
    } else {
      if (!importText.value.trim()) {
        importError.value = t('manage.error.noFile')
        return
      }
      await playlistStore.importFromText(
        importText.value,
        importName.value.trim(),
        'file',
        importName.value.trim(),
      )
    }
    showImportModal.value = false
  } catch {
    importError.value = playlistStore.error ?? t('manage.error.import')
  }
}

// ─── Edição de nome ───────────────────────────────────────────────────────────
const editingPlaylist = ref<Playlist | null>(null)
const editName = ref('')

function startEdit(pl: Playlist) {
  editingPlaylist.value = pl
  editName.value = pl.name
}

async function saveEdit() {
  if (!editingPlaylist.value || !editName.value.trim()) return
  await playlistStore.updatePlaylist(editingPlaylist.value.id!, editName.value.trim())
  editingPlaylist.value = null
}

// ─── Exclusão ─────────────────────────────────────────────────────────────────
async function confirmDelete(pl: Playlist) {
  if (!confirm(tParam('manage.confirm.deleteList', { name: pl.name }))) return
  await playlistStore.deletePlaylist(pl.id!)
  if (managePl.value?.id === pl.id) managePl.value = null
}

// ─── Painel de gerenciamento da lista ────────────────────────────────────────
const managePl = ref<Playlist | null>(null)
const manageTab = ref<'geral' | 'grupos'>('geral')
const manageGroups = ref<{ name: string; count: number }[]>([])
const manageLoading = ref(false)
const manageName = ref('')
const manageRenameLoading = ref(false)
const renamingGroup = ref<string | null>(null)
const renameGroupVal = ref('')
const showCreateGroup = ref(false)
const newGroupName = ref('')
const newGroupSource = ref('')

async function selectForManage(pl: Playlist) {
  if (managePl.value?.id === pl.id) {
    managePl.value = null
    return
  }
  managePl.value = pl
  manageName.value = pl.name
  manageTab.value = 'geral'
  renamingGroup.value = null
  showCreateGroup.value = false
  newGroupName.value = ''
  newGroupSource.value = ''
  expandedGroups.value = []
  groupChannelsCache.value = {}
}

async function switchManageTab(tab: 'geral' | 'grupos') {
  manageTab.value = tab
  if (tab === 'grupos' && managePl.value) {
    await refreshManageGroups(managePl.value.id!)
  }
}

async function refreshManageGroups(playlistId: number) {
  manageLoading.value = true
  const chs = await db.channels.where('playlistId').equals(playlistId).toArray()
  const map = new Map<string, number>()
  for (const ch of chs) {
    const g = ch.group?.trim() || '(Sem grupo)'
    map.set(g, (map.get(g) ?? 0) + 1)
  }
  manageGroups.value = Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  const existingNames = new Set(manageGroups.value.map(g => g.name))
  expandedGroups.value = expandedGroups.value.filter(n => existingNames.has(n))
  for (const groupName of expandedGroups.value) {
    await loadGroupChannels(groupName)
  }
  manageLoading.value = false
}

async function saveManageName() {
  if (!managePl.value || !manageName.value.trim()) return
  manageRenameLoading.value = true
  await playlistStore.updatePlaylist(managePl.value.id!, manageName.value.trim())
  managePl.value = playlistStore.playlists.find(p => p.id === managePl.value!.id) ?? managePl.value
  manageRenameLoading.value = false
}

function startRenameGroup(name: string) {
  renamingGroup.value = name
  renameGroupVal.value = name
}

async function saveRenameGroup() {
  if (!managePl.value || renamingGroup.value === null || !renameGroupVal.value.trim()) return
  const newName = renameGroupVal.value.trim()
  const oldName = renamingGroup.value
  renamingGroup.value = null
  if (newName === oldName) return
  const chs = await db.channels.where('playlistId').equals(managePl.value.id!).toArray()
  const toUpdate = chs
    .filter(ch => (ch.group?.trim() || '(Sem grupo)') === oldName)
    .map(ch => ({ ...ch, group: newName === '(Sem grupo)' ? '' : newName }))
  if (toUpdate.length) await db.channels.bulkPut(toUpdate)
  await refreshManageGroups(managePl.value.id!)
}

async function deleteGroup(groupName: string) {
  if (!managePl.value) return
  const chs = await db.channels.where('playlistId').equals(managePl.value.id!).toArray()
  const toDelete = chs.filter(ch => (ch.group?.trim() || '(Sem grupo)') === groupName)
  if (!confirm(tParam('manage.confirm.deleteGroup', { name: groupName, count: toDelete.length }))) return
  await db.channels.bulkDelete(toDelete.map(ch => ch.id!))
  await refreshManageGroups(managePl.value.id!)
}

async function submitCreateGroup() {
  if (!managePl.value || !newGroupName.value.trim() || !newGroupSource.value) return
  const targetName = newGroupName.value.trim()
  const sourceName = newGroupSource.value
  const chs = await db.channels.where('playlistId').equals(managePl.value.id!).toArray()
  const toUpdate = chs
    .filter(ch => (ch.group?.trim() || '(Sem grupo)') === sourceName)
    .map(ch => ({ ...ch, group: targetName === '(Sem grupo)' ? '' : targetName }))
  if (toUpdate.length) await db.channels.bulkPut(toUpdate)
  newGroupName.value = ''
  newGroupSource.value = ''
  showCreateGroup.value = false
  await refreshManageGroups(managePl.value.id!)
}

// ─── Grupos: expansão e drag & drop ──────────────────────────────────────────
const expandedGroups = ref<string[]>([])
const groupChannelsCache = ref<Record<string, Channel[]>>({})
const dragChannel = ref<{ channel: Channel; fromGroup: string } | null>(null)
const dragOverGroup = ref<string | null>(null)

async function toggleGroup(groupName: string) {
  const idx = expandedGroups.value.indexOf(groupName)
  if (idx !== -1) {
    expandedGroups.value.splice(idx, 1)
    return
  }
  expandedGroups.value.push(groupName)
  if (!groupChannelsCache.value[groupName]) {
    await loadGroupChannels(groupName)
  }
}

async function loadGroupChannels(groupName: string) {
  if (!managePl.value) return
  const chs = await db.channels.where('playlistId').equals(managePl.value.id!).toArray()
  groupChannelsCache.value[groupName] = chs
    .filter(ch => (ch.group?.trim() || '(Sem grupo)') === groupName)
}

function onDragStart(e: DragEvent, channel: Channel, fromGroup: string) {
  dragChannel.value = { channel, fromGroup }
  e.dataTransfer!.effectAllowed = 'move'
}

function onDragEnd() {
  dragChannel.value = null
  dragOverGroup.value = null
}

function onGroupDragOver(e: DragEvent, groupName: string) {
  if (!dragChannel.value || dragChannel.value.fromGroup === groupName) return
  e.preventDefault()
  dragOverGroup.value = groupName
}

function onGroupDragLeave(e: DragEvent) {
  const related = e.relatedTarget as Element | null
  if (!related || !(e.currentTarget as Element).contains(related)) {
    dragOverGroup.value = null
  }
}

async function onGroupDrop(e: DragEvent, targetGroup: string) {
  e.preventDefault()
  dragOverGroup.value = null
  if (!dragChannel.value || !managePl.value) return
  const { channel, fromGroup } = dragChannel.value
  dragChannel.value = null
  if (fromGroup === targetGroup) return
  const newGroupValue = targetGroup === '(Sem grupo)' ? '' : targetGroup
  await db.channels.update(channel.id!, { group: newGroupValue })
  await refreshManageGroups(managePl.value.id!)
}

// ─── EPG ─────────────────────────────────────────────────────────────────────
const epgFormName = ref('')
const epgFormUrl = ref('')
const epgFormError = ref<string | null>(null)
const refreshingSourceId = ref<number | null>(null)

async function addEpgSource() {
  epgFormError.value = null
  if (!epgFormName.value.trim()) { epgFormError.value = 'Informe um nome.'; return }
  if (!epgFormUrl.value.trim()) { epgFormError.value = 'Informe a URL.'; return }
  await epgStore.addSource(epgFormName.value.trim(), epgFormUrl.value.trim())
  epgFormName.value = ''
  epgFormUrl.value = ''
}

async function refreshEpgSource(source: import('@/types').EpgSource) {
  refreshingSourceId.value = source.id!
  try {
    await epgStore.fetchEpg(source, settingsStore.proxyUrl, settingsStore.proxyEnabled)
  } catch {
    // error já em epgStore.error
  } finally {
    refreshingSourceId.value = null
  }
}

function formatEpgDate(date: Date | null): string {
  if (!date) return t('settings.epg.never')
  return new Date(date).toLocaleString()
}

// ─── Health Check ─────────────────────────────────────────────────────────────
const healthCheckPlaylistId = ref<number | null>(null)
const healthCheckTimeout = ref(8)
const healthCheckConcurrency = ref(5)
const healthCheckAutoHide = ref(false)

async function startHealthCheck() {
  if (!healthCheckPlaylistId.value) return
  await playlistStore.runHealthCheck(healthCheckPlaylistId.value, healthCheckTimeout.value * 1000, healthCheckConcurrency.value)
  if (healthCheckAutoHide.value && playlistStore.healthCheck.offlineCount > 0) {
    await playlistStore.hideOfflineChannels(healthCheckPlaylistId.value)
  }
}

function stopHealthCheck() {
  playlistStore.stopHealthCheck()
}

async function hideOffline() {
  if (!healthCheckPlaylistId.value) return
  await playlistStore.hideOfflineChannels(healthCheckPlaylistId.value)
}

// ─── Auto-refresh ─────────────────────────────────────────────────────────────
const refreshingPlaylistId = ref<number | null>(null)

const REFRESH_INTERVAL_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0,    label: '' },
  { value: 15,   label: '15 min' },
  { value: 30,   label: '30 min' },
  { value: 60,   label: '1 h' },
  { value: 120,  label: '2 h' },
  { value: 360,  label: '6 h' },
  { value: 720,   label: '12 h' },
  { value: 1440,  label: '24 h' },
  { value: 2880,  label: '48 h' },
  { value: 10080, label: '7 d' },
  { value: 21600, label: '15 d' },
  { value: 44640, label: '31 d' },
]

async function handleRefreshIntervalChange(playlistId: number, value: string) {
  await playlistStore.setRefreshInterval(playlistId, parseInt(value, 10))
}

async function handleRefreshNow(pl: Playlist) {
  refreshingPlaylistId.value = pl.id!
  await playlistStore.refreshPlaylist(pl.id!)
  refreshingPlaylistId.value = null
}

function formatRelative(date: Date | undefined): string {
  if (!date) return '—'
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (diff < 60) return t('settings.justNow')
  if (diff < 3600) {
    const m = Math.floor(diff / 60)
    return locale.value === 'pt-BR' ? `há ${m} min` : `${m} min ago`
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600)
    return locale.value === 'pt-BR' ? `há ${h}h` : `${h}h ago`
  }
  const d = Math.floor(diff / 86400)
  return locale.value === 'pt-BR' ? `há ${d}d` : `${d}d ago`
}

// ─── Init ─────────────────────────────────────────────────────────────────────
onMounted(async () => {
  await settingsStore.load()
  await playlistStore.loadPlaylists()
  await epgStore.loadSources()
  proxyDraft.value = settingsStore.proxyUrl
})
</script>

<template>
  <div class="flex-1 overflow-y-auto p-6 md:p-10">
    <div class="max-w-4xl mx-auto space-y-8">

      <!-- Cabeçalho -->
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-semibold text-zinc-100">{{ t('settings.title') }}</h1>

        <!-- Toast de confirmação -->
        <Transition
          enter-active-class="transition-opacity duration-200"
          leave-active-class="transition-opacity duration-300"
          enter-from-class="opacity-0"
          leave-to-class="opacity-0"
        >
          <span
            v-if="savedVisible"
            class="text-xs text-emerald-400 bg-emerald-900/40 border border-emerald-700/50 px-3 py-1 rounded-full"
          >
            {{ t('settings.saved') }}
          </span>
        </Transition>
      </div>

      <!-- ── Seção: Idioma ─────────────────────────────────────────── -->
      <section class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div class="px-5 py-4 border-b border-zinc-800">
          <h2 class="text-sm font-semibold text-zinc-200">{{ t('settings.language.section') }}</h2>
          <p class="text-xs text-zinc-500 mt-0.5">{{ t('settings.language.description') }}</p>
        </div>

        <ul class="divide-y divide-zinc-800">
          <li v-for="loc in LOCALES" :key="loc.code">
            <button
              class="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-zinc-800/60"
              :class="settingsStore.language === loc.code ? 'bg-zinc-800/40' : ''"
              @click="selectLanguage(loc.code)"
            >
              <span class="text-2xl leading-none select-none">{{ loc.flag }}</span>
              <span class="flex-1 text-sm text-zinc-200">{{ loc.label }}</span>
              <span
                class="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors"
                :class="settingsStore.language === loc.code ? 'border-indigo-500 bg-indigo-500' : 'border-zinc-600 bg-transparent'"
              >
                <span v-if="settingsStore.language === loc.code" class="w-1.5 h-1.5 rounded-full bg-white" />
              </span>
            </button>
          </li>
        </ul>
      </section>

      <!-- ── Seção: Diversos ───────────────────────────────────────── -->
      <section class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div class="px-5 py-4 border-b border-zinc-800">
          <h2 class="text-sm font-semibold text-zinc-200">{{ t('settings.misc.title') }}</h2>
        </div>

        <div class="p-5 space-y-5">
          <!-- Agrupamento -->
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-sm text-zinc-200">{{ t('manage.settings.grouping.title') }}</p>
              <p class="text-xs text-zinc-500 mt-0.5">{{ t('manage.settings.grouping.desc') }}</p>
            </div>
            <AppToggle :model-value="settingsStore.groupingEnabled" @update:model-value="settingsStore.toggleGrouping" />
          </div>

          <!-- Tema light -->
          <div class="flex items-center justify-between gap-4 pt-4 border-t border-zinc-800">
            <div>
              <p class="text-sm text-zinc-200">{{ t('settings.theme.title') }}</p>
              <p class="text-xs text-zinc-500 mt-0.5">{{ t('settings.theme.desc') }}</p>
            </div>
            <AppToggle :model-value="settingsStore.theme === 'light'" @update:model-value="settingsStore.toggleTheme" />
          </div>

          <!-- Forçar HTTPS -->
          <div class="flex items-center justify-between gap-4 pt-4 border-t border-zinc-800">
            <div>
              <p class="text-sm text-zinc-200">{{ t('settings.forceHttps.title') }}</p>
              <p class="text-xs text-zinc-500 mt-0.5">{{ t('settings.forceHttps.desc') }}</p>
            </div>
            <AppToggle :model-value="settingsStore.forceHttps" @update:model-value="settingsStore.toggleForceHttps" />
          </div>

          <!-- Aviso: outro navegador não suporta configuração de conteúdo inseguro por site -->
          <div v-if="!isChrome && !isEdge" class="rounded-lg bg-amber-950/40 border border-amber-700/50 p-3">
            <p class="text-xs text-amber-400">💡 {{ t('settings.insecureContent.otherBrowser') }}</p>
          </div>

          <!-- Dica: Conteúdo não seguro (Chrome / Edge) -->
          <div v-if="isChrome || isEdge" class="rounded-lg bg-zinc-900 border border-zinc-700/50 p-3 space-y-2">
            <p class="text-xs font-medium text-zinc-300">{{ t('settings.insecureContent.title') }}</p>
            <p class="text-xs text-zinc-500">{{ t('settings.insecureContent.desc') }}</p>
            <ol class="text-xs text-zinc-500 list-decimal list-inside space-y-0.5 pl-1">
              <li>{{ t('settings.insecureContent.step1') }}</li>
              <li>{{ t('settings.insecureContent.step2') }}</li>
              <li>{{ t('settings.insecureContent.step3') }}</li>
            </ol>
            <div class="flex items-center gap-2 pt-1">
              <span class="text-xs text-zinc-500 shrink-0">{{ t('settings.insecureContent.openUrl') }}</span>
              <code class="flex-1 min-w-0 bg-zinc-800 rounded px-2 py-1 text-zinc-400 text-xs break-all">{{ insecureContentUrl }}</code>
              <button
                class="shrink-0 px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs transition-colors"
                @click="copyInsecureUrl"
              >
                {{ copySuccess ? t('settings.insecureContent.copied') : t('settings.insecureContent.copy') }}
              </button>
            </div>
          </div>

          <!-- Proxy -->
          <div class="space-y-3 pt-4 border-t border-zinc-800">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm text-zinc-200">{{ t('manage.settings.proxy.title') }}</p>
                <p class="text-xs text-zinc-500 mt-0.5">{{ t('manage.settings.proxy.desc') }}</p>
              </div>
              <AppToggle
                :model-value="settingsStore.proxyEnabled"
                :disabled="!settingsStore.proxyUrl"
                @update:model-value="settingsStore.toggleProxy"
              />
            </div>

            <div class="flex gap-2">
              <input
                v-model="proxyDraft"
                type="url"
                :placeholder="t('manage.settings.proxy.placeholder')"
                :disabled="settingsStore.proxyEnabled"
                class="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded px-3 py-2 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <AppButton
                variant="secondary"
                :disabled="settingsStore.proxyEnabled"
                @click="saveProxy"
              >
                {{ t('manage.action.save') }}
              </AppButton>
            </div>

            <p v-if="settingsStore.proxyEnabled && settingsStore.proxyUrl" class="text-xs text-emerald-400">
              {{ t('manage.settings.proxy.active') }}
            </p>
            <p v-else-if="settingsStore.proxyUrl && !settingsStore.proxyEnabled" class="text-xs text-zinc-500">
              {{ t('manage.settings.proxy.configured') }}
            </p>
            <p v-else-if="!settingsStore.proxyUrl" class="text-xs text-zinc-600">
              {{ t('manage.settings.proxy.noUrl') }}
            </p>
          </div>
        </div>
      </section>

      <!-- ── Seção: EPG ────────────────────────────────────────────── -->
      <section class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div class="px-5 py-4 border-b border-zinc-800">
          <h2 class="text-sm font-semibold text-zinc-200">{{ t('settings.epg.title') }}</h2>
          <p class="text-xs text-zinc-500 mt-1">{{ t('settings.epg.description') }}</p>
        </div>
        <div class="p-5 space-y-5">
          <!-- Formulário de adição -->
          <div class="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2 items-end">
            <div>
              <label class="block text-xs text-zinc-400 mb-1">{{ t('settings.epg.sourceName') }}</label>
              <input
                v-model="epgFormName"
                type="text"
                :placeholder="t('settings.epg.namePlaceholder')"
                class="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded px-3 py-1.5 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label class="block text-xs text-zinc-400 mb-1">{{ t('settings.epg.sourceUrl') }}</label>
              <input
                v-model="epgFormUrl"
                type="url"
                :placeholder="t('settings.epg.urlPlaceholder')"
                class="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded px-3 py-1.5 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <AppButton size="sm" @click="addEpgSource">{{ t('settings.epg.addSource') }}</AppButton>
          </div>
          <p v-if="epgFormError" class="text-xs text-red-400">{{ epgFormError }}</p>

          <!-- Lista de fontes -->
          <div v-if="epgStore.sources.length === 0" class="text-xs text-zinc-600 text-center py-2">
            {{ t('settings.epg.noSources') }}
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="source in epgStore.sources"
              :key="source.id"
              class="flex items-center gap-3 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3"
            >
              <div class="flex-1 min-w-0">
                <p class="text-sm text-zinc-200 font-medium truncate">{{ source.name }}</p>
                <p class="text-xs text-zinc-500 truncate">{{ source.url }}</p>
                <p class="text-xs text-zinc-600 mt-0.5">
                  {{ t('settings.epg.lastFetched') }} {{ formatEpgDate(source.lastFetched) }}
                </p>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <AppButton
                  size="sm"
                  variant="secondary"
                  :disabled="refreshingSourceId === source.id || epgStore.isLoading"
                  @click="refreshEpgSource(source)"
                >
                  {{ refreshingSourceId === source.id ? t('settings.epg.fetching') : t('settings.epg.refresh') }}
                </AppButton>
                <AppButton size="sm" variant="danger" @click="epgStore.deleteSource(source.id!)">
                  {{ t('settings.epg.delete') }}
                </AppButton>
              </div>
            </div>
            <p v-if="epgStore.error" class="text-xs text-red-400">{{ epgStore.error }}</p>
          </div>
        </div>
      </section>

      <!-- ── Seção: Verificação de Saúde dos Canais ──────────────── -->
      <section class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div class="px-5 py-4 border-b border-zinc-800">
          <h2 class="text-sm font-semibold text-zinc-200">{{ t('settings.healthCheck.title') }}</h2>
          <p class="text-xs text-zinc-500 mt-0.5">{{ t('settings.healthCheck.description') }}</p>
        </div>
        <div class="p-5 space-y-4">
          <!-- Sem playlists -->
          <p v-if="playlistStore.playlists.length === 0" class="text-xs text-zinc-500">
            {{ t('settings.healthCheck.noPlaylist') }}
          </p>

          <template v-else>
            <!-- Seletor de playlist + timeout + concorrência -->
            <div class="flex flex-wrap gap-3 items-end">
              <div class="flex-1 min-w-40">
                <label class="block text-xs text-zinc-400 mb-1">{{ t('settings.healthCheck.selectPlaylist') }}</label>
                <select
                  v-model="healthCheckPlaylistId"
                  :disabled="playlistStore.healthCheck.status === 'running'"
                  class="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                >
                  <option :value="null" disabled>—</option>
                  <option v-for="pl in playlistStore.playlists" :key="pl.id" :value="pl.id">{{ pl.name }}</option>
                </select>
              </div>
              <div class="w-28">
                <label class="block text-xs text-zinc-400 mb-1">{{ t('settings.healthCheck.timeout') }}</label>
                <input
                  v-model.number="healthCheckTimeout"
                  type="number"
                  min="1"
                  max="15"
                  :disabled="playlistStore.healthCheck.status === 'running'"
                  class="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                />
              </div>
              <div class="w-28">
                <label class="block text-xs text-zinc-400 mb-1">{{ t('settings.healthCheck.concurrency') }}</label>
                <input
                  v-model.number="healthCheckConcurrency"
                  type="number"
                  min="1"
                  max="15"
                  :disabled="playlistStore.healthCheck.status === 'running'"
                  class="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                />
              </div>
            </div>

            <!-- Auto hide toggle -->
            <div class="flex items-center gap-3">
              <AppToggle
                :model-value="healthCheckAutoHide"
                :disabled="playlistStore.healthCheck.status === 'running'"
                @update:model-value="healthCheckAutoHide = $event"
              />
              <span class="text-sm text-zinc-300">{{ t('settings.healthCheck.autoHide') }}</span>
            </div>

            <!-- Botões iniciar/parar -->
            <div class="flex gap-2">
              <AppButton
                v-if="playlistStore.healthCheck.status !== 'running'"
                :disabled="!healthCheckPlaylistId"
                @click="startHealthCheck"
              >
                {{ t('settings.healthCheck.start') }}
              </AppButton>
              <AppButton
                v-else
                variant="danger"
                @click="stopHealthCheck"
              >
                {{ t('settings.healthCheck.stop') }}
              </AppButton>
            </div>

            <!-- Progresso -->
            <div v-if="playlistStore.healthCheck.status !== 'idle'" class="space-y-2">
              <p class="text-xs text-zinc-400">
                {{ tParam('settings.healthCheck.progress', {
                  checked: String(playlistStore.healthCheck.checked),
                  total: String(playlistStore.healthCheck.total)
                }) }}
              </p>
              <div class="w-full bg-zinc-800 rounded-full h-1.5">
                <div
                  class="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                  :style="{
                    width: playlistStore.healthCheck.total > 0
                      ? `${(playlistStore.healthCheck.checked / playlistStore.healthCheck.total) * 100}%`
                      : '0%'
                  }"
                />
              </div>
            </div>

            <!-- Resultado -->
            <div v-if="playlistStore.healthCheck.status === 'done'" class="space-y-3">
              <p class="text-xs text-zinc-400">
                {{ t('settings.healthCheck.done') }}
                {{
                  playlistStore.healthCheck.offlineCount > 0
                    ? tParam('settings.healthCheck.offlineFound', { count: String(playlistStore.healthCheck.offlineCount) })
                    : t('settings.healthCheck.noneOffline')
                }}
              </p>
              <AppButton
                v-if="playlistStore.healthCheck.offlineCount > 0"
                variant="secondary"
                @click="hideOffline"
              >
                {{ tParam('settings.healthCheck.hideButton', { count: String(playlistStore.healthCheck.offlineCount) }) }}
              </AppButton>
            </div>
          </template>
        </div>
      </section>

      <!-- ── Seção: Minhas Listas ──────────────────────────────────── -->
      <section class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div class="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 class="text-sm font-semibold text-zinc-200">{{ t('settings.lists.title') }}</h2>
          <AppButton size="sm" @click="openImport">{{ t('manage.import.button') }}</AppButton>
        </div>

        <div class="p-5">
          <!-- Empty state -->
          <div
            v-if="playlistStore.playlists.length === 0"
            class="border-2 border-dashed border-zinc-700 rounded-lg p-10 text-center text-zinc-600"
          >
            <p class="text-sm">{{ t('manage.empty.line1') }}</p>
            <p class="text-xs mt-1">{{ t('manage.empty.line2') }}</p>
          </div>

          <!-- Tabela de listas -->
          <div v-else class="overflow-x-auto rounded-lg border border-zinc-800">
            <table class="w-full text-sm text-zinc-300">
              <thead class="bg-zinc-800/60 text-zinc-500 text-xs uppercase tracking-wider">
                <tr>
                  <th class="px-4 py-3 text-left">{{ t('manage.table.name') }}</th>
                  <th class="px-4 py-3 text-left hidden md:table-cell">{{ t('manage.table.source') }}</th>
                  <th class="px-4 py-3 text-left hidden lg:table-cell">{{ t('manage.table.addedAt') }}</th>
                  <th class="px-4 py-3 text-left hidden xl:table-cell">{{ t('settings.autoRefresh') }}</th>
                  <th class="px-4 py-3 text-left hidden xl:table-cell">{{ t('settings.lastRefreshed') }}</th>
                  <th class="px-4 py-3 text-right">{{ t('manage.table.actions') }}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-800">
                <tr
                  v-for="pl in playlistStore.playlists"
                  :key="pl.id"
                  class="hover:bg-zinc-800/40 transition-colors cursor-pointer select-none"
                  :class="{ 'ring-1 ring-inset ring-indigo-500 bg-zinc-800/40': managePl?.id === pl.id }"
                  @click="selectForManage(pl)"
                >
                  <td class="px-4 py-3">
                    <template v-if="editingPlaylist?.id === pl.id">
                      <input
                        v-model="editName"
                        class="bg-zinc-800 border border-zinc-600 text-white text-sm rounded px-2 py-1 w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        @keyup.enter="saveEdit"
                        @keyup.escape="editingPlaylist = null"
                      />
                    </template>
                    <span v-else class="font-medium text-white">{{ pl.name }}</span>
                  </td>

                  <td class="px-4 py-3 hidden md:table-cell">
                    <span
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                      :class="pl.source === 'url' ? 'bg-blue-900/50 text-blue-300' : 'bg-emerald-900/50 text-emerald-300'"
                    >
                      {{ pl.source === 'url' ? t('manage.source.url') : t('manage.source.file') }}
                    </span>
                  </td>

                  <td class="px-4 py-3 hidden lg:table-cell text-zinc-500 text-xs">
                    {{ new Date(pl.createdAt).toLocaleDateString(locale) }}
                  </td>

                  <!-- Auto-refresh interval -->
                  <td class="px-4 py-3 hidden xl:table-cell" @click.stop>
                    <template v-if="pl.source === 'url'">
                      <select
                        :value="pl.autoRefreshInterval ?? 0"
                        class="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        @change="handleRefreshIntervalChange(pl.id!, ($event.target as HTMLSelectElement).value)"
                      >
                        <option :value="0">{{ t('settings.autoRefreshDisabled') }}</option>
                        <option v-for="opt in REFRESH_INTERVAL_OPTIONS.slice(1)" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                      </select>
                    </template>
                    <span v-else class="text-zinc-600">—</span>
                  </td>

                  <!-- Last refreshed -->
                  <td class="px-4 py-3 hidden xl:table-cell text-zinc-500 text-xs">
                    <template v-if="pl.source === 'url'">
                      <span v-if="refreshingPlaylistId === pl.id" class="text-indigo-400">{{ t('settings.refreshing') }}</span>
                      <span v-else>{{ formatRelative(pl.lastRefreshedAt) }}</span>
                    </template>
                    <span v-else class="text-zinc-600">—</span>
                  </td>

                  <td class="px-4 py-3 text-right" @click.stop>
                    <div class="flex items-center justify-end gap-2">
                      <template v-if="editingPlaylist?.id === pl.id">
                        <AppButton size="sm" @click="saveEdit">{{ t('manage.action.save') }}</AppButton>
                        <AppButton size="sm" variant="ghost" @click="editingPlaylist = null">{{ t('manage.action.cancel') }}</AppButton>
                      </template>
                      <template v-else>
                        <AppButton v-if="pl.source === 'url'" size="sm" variant="ghost" :disabled="refreshingPlaylistId === pl.id" @click="handleRefreshNow(pl)" :title="t('settings.refreshNow')">&#x21BB;</AppButton>
                        <AppButton size="sm" variant="secondary" @click="startEdit(pl)">{{ t('manage.action.rename') }}</AppButton>
                        <AppButton size="sm" variant="danger" @click="confirmDelete(pl)">{{ t('manage.action.delete') }}</AppButton>
                      </template>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Painel de gerenciamento da lista selecionada -->
          <Transition
            enter-active-class="transition-all duration-200 ease-out"
            enter-from-class="opacity-0 -translate-y-2"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition-all duration-150 ease-in"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 -translate-y-2"
          >
            <div v-if="managePl" class="mt-4 rounded-lg border border-zinc-700 bg-zinc-800/40 overflow-hidden">
              <!-- Header -->
              <div class="flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-zinc-800/60">
                <h3 class="text-sm font-semibold text-zinc-200">
                  {{ t('manage.panel.title') }} <span class="text-white">{{ managePl.name }}</span>
                </h3>
                <button
                  class="text-zinc-500 hover:text-white transition-colors text-xl leading-none px-1"
                  @click="managePl = null"
                >×</button>
              </div>

              <!-- Tabs -->
              <div class="flex border-b border-zinc-800 px-5">
                <button
                  v-for="tab in (['geral', 'grupos'] as const)"
                  :key="tab"
                  class="px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px"
                  :class="manageTab === tab ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'"
                  @click="switchManageTab(tab)"
                >
                  {{ tab === 'geral' ? t('manage.tab.general') : t('manage.tab.groups') }}
                </button>
              </div>

              <!-- Tab: Geral -->
              <div v-if="manageTab === 'geral'" class="p-5 space-y-5">
                <div class="space-y-2">
                  <label class="block text-xs font-medium text-zinc-400 uppercase tracking-wider">{{ t('manage.general.renameLabel') }}</label>
                  <div class="flex gap-2">
                    <input
                      v-model="manageName"
                      type="text"
                      class="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      @keyup.enter="saveManageName"
                    />
                    <AppButton :loading="manageRenameLoading" @click="saveManageName">{{ t('manage.action.save') }}</AppButton>
                  </div>
                </div>

                <div class="pt-4 border-t border-zinc-800">
                  <p class="text-xs text-zinc-500 mb-3">{{ t('manage.general.danger') }}</p>
                  <AppButton variant="danger" @click="confirmDelete(managePl)">{{ t('manage.general.deleteList') }}</AppButton>
                </div>
              </div>

              <!-- Tab: Grupos -->
              <div v-if="manageTab === 'grupos'" class="p-5 space-y-4">
                <div v-if="manageLoading" class="text-zinc-500 text-sm py-6 text-center">{{ t('manage.groups.loading') }}</div>

                <div v-else-if="manageGroups.length === 0" class="text-zinc-600 text-sm py-6 text-center">
                  {{ t('manage.groups.empty') }}
                </div>

                <div v-else class="rounded-lg border border-zinc-800 overflow-hidden divide-y divide-zinc-800">
                  <div
                    v-for="g in manageGroups"
                    :key="g.name"
                    class="transition-colors"
                    :class="dragOverGroup === g.name ? 'bg-indigo-900/25 ring-1 ring-inset ring-indigo-500/60' : ''"
                    @dragover="onGroupDragOver($event, g.name)"
                    @dragleave="onGroupDragLeave"
                    @drop="onGroupDrop($event, g.name)"
                  >
                    <div
                      class="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-zinc-800/60 select-none"
                      @click="toggleGroup(g.name)"
                    >
                      <svg
                        class="w-3.5 h-3.5 text-zinc-500 shrink-0 transition-transform duration-150"
                        :class="expandedGroups.includes(g.name) ? 'rotate-90' : ''"
                        xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                      >
                        <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd"/>
                      </svg>

                      <div class="flex-1 min-w-0" @click.stop>
                        <template v-if="renamingGroup === g.name">
                          <input
                            v-model="renameGroupVal"
                            class="bg-zinc-800 border border-zinc-600 text-white text-sm rounded px-2 py-0.5 w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            @keyup.enter="saveRenameGroup"
                            @keyup.escape="renamingGroup = null"
                          />
                        </template>
                        <span v-else class="text-sm text-zinc-200 font-medium truncate block">{{ g.name }}</span>
                      </div>

                      <span class="text-xs text-zinc-500 shrink-0 tabular-nums">{{ g.count }} {{ t('manage.groups.channels') }}</span>

                      <span v-if="dragOverGroup === g.name" class="text-xs text-indigo-400 shrink-0 animate-pulse">
                        {{ t('manage.groups.dropHere') }}
                      </span>

                      <div class="flex items-center gap-1.5 shrink-0 ml-1" @click.stop>
                        <template v-if="renamingGroup === g.name">
                          <AppButton size="sm" @click="saveRenameGroup">{{ t('manage.action.save') }}</AppButton>
                          <AppButton size="sm" variant="ghost" @click="renamingGroup = null">{{ t('manage.action.cancel') }}</AppButton>
                        </template>
                        <template v-else>
                          <AppButton size="sm" variant="secondary" @click="startRenameGroup(g.name)">{{ t('manage.action.rename') }}</AppButton>
                          <AppButton size="sm" variant="danger" @click="deleteGroup(g.name)">{{ t('manage.action.delete') }}</AppButton>
                        </template>
                      </div>
                    </div>

                    <div v-if="expandedGroups.includes(g.name)" class="border-t border-zinc-800/60 bg-zinc-950/50">
                      <div v-if="!groupChannelsCache[g.name]" class="px-4 py-2 text-xs text-zinc-600 italic">
                        {{ t('manage.groups.loadingChannels') }}
                      </div>
                      <div v-else-if="groupChannelsCache[g.name].length === 0" class="px-4 py-2 text-xs text-zinc-600 italic">
                        {{ t('manage.groups.emptyGroup') }}
                      </div>
                      <div
                        v-else
                        v-for="ch in groupChannelsCache[g.name]"
                        :key="ch.id"
                        class="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-900/60 group/ch cursor-grab active:cursor-grabbing"
                        draggable="true"
                        @dragstart="onDragStart($event, ch, g.name)"
                        @dragend="onDragEnd"
                      >
                        <svg
                          class="w-3.5 h-3.5 text-zinc-700 group-hover/ch:text-zinc-400 shrink-0 transition-colors"
                          xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"
                        >
                          <circle cx="5.5" cy="3.5" r="1.2"/><circle cx="10.5" cy="3.5" r="1.2"/>
                          <circle cx="5.5" cy="8" r="1.2"/><circle cx="10.5" cy="8" r="1.2"/>
                          <circle cx="5.5" cy="12.5" r="1.2"/><circle cx="10.5" cy="12.5" r="1.2"/>
                        </svg>
                        <span class="text-xs text-zinc-400 group-hover/ch:text-zinc-200 truncate transition-colors">{{ ch.name }}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Criar grupo -->
                <div class="border-t border-zinc-800 pt-4">
                  <button
                    v-if="!showCreateGroup"
                    class="text-sm text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
                    @click="showCreateGroup = true"
                  >
                    {{ t('manage.groups.createNew') }}
                  </button>
                  <div v-else class="space-y-3">
                    <p class="text-xs text-zinc-400">{{ t('manage.groups.createDesc') }}</p>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label class="block text-xs text-zinc-500 mb-1">{{ t('manage.groups.newName') }}</label>
                        <input
                          v-model="newGroupName"
                          type="text"
                          :placeholder="t('manage.groups.newNamePlaceholder')"
                          class="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded px-3 py-2 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label class="block text-xs text-zinc-500 mb-1">{{ t('manage.groups.moveFrom') }}</label>
                        <select
                          v-model="newGroupSource"
                          class="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="" disabled>{{ t('manage.groups.selectGroup') }}</option>
                          <option v-for="g in manageGroups" :key="g.name" :value="g.name">
                            {{ g.name }} ({{ g.count }})
                          </option>
                        </select>
                      </div>
                    </div>
                    <div class="flex gap-2">
                      <AppButton :disabled="!newGroupName.trim() || !newGroupSource" @click="submitCreateGroup">
                        {{ t('manage.groups.createButton') }}
                      </AppButton>
                      <AppButton variant="ghost" @click="showCreateGroup = false; newGroupName = ''; newGroupSource = ''">
                        {{ t('manage.action.cancel') }}
                      </AppButton>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </section>

    </div>
  </div>

  <!-- ── Modal de importação ──────────────────────────────────── -->
  <AppModal
    v-if="showImportModal"
    :title="t('manage.import.title')"
    @close="showImportModal = false"
  >
    <div class="flex border-b border-zinc-800 mb-4 -mx-5 px-5">
      <button
        v-for="tab in (['url', 'file'] as const)"
        :key="tab"
        class="px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px"
        :class="importTab === tab ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'"
        @click="importTab = tab"
      >
        {{ tab === 'url' ? t('manage.import.tabUrl') : t('manage.import.tabFile') }}
      </button>
    </div>

    <div class="space-y-3">
      <div>
        <label class="block text-xs text-zinc-400 mb-1">{{ t('manage.import.nameLabel') }}</label>
        <input
          v-model="importName"
          type="text"
          :placeholder="t('manage.import.namePlaceholder')"
          class="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded px-3 py-2 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div v-if="importTab === 'url'">
        <label class="block text-xs text-zinc-400 mb-1">{{ t('manage.import.urlLabel') }}</label>
        <input
          v-model="importUrl"
          type="url"
          :placeholder="t('manage.import.urlPlaceholder')"
          class="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded px-3 py-2 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div v-else>
        <label class="block text-xs text-zinc-400 mb-1">{{ t('manage.import.fileLabel') }}</label>
        <input
          type="file"
          accept=".m3u,.m3u8,.txt"
          class="w-full text-sm text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-zinc-700 file:text-zinc-200 file:text-xs hover:file:bg-zinc-600 cursor-pointer"
          @change="handleFileChange"
        />
      </div>

      <p v-if="importError" class="text-xs text-red-400">{{ importError }}</p>

      <!-- Progresso de importação -->
      <div v-if="playlistStore.importProgress.status !== 'idle'" class="space-y-1.5 pt-1">
        <p class="text-xs text-zinc-400">
          <template v-if="playlistStore.importProgress.status === 'saving'">
            {{ tParam('manage.progress.saving', {
              current: String(Math.min(playlistStore.importProgress.current, playlistStore.importProgress.total)),
              total: String(playlistStore.importProgress.total)
            }) }}
          </template>
          <template v-else-if="playlistStore.importProgress.status === 'parsing'">
            {{ t('manage.progress.parsing') }}
          </template>
          <template v-else>
            {{ t('manage.progress.downloading') }}
          </template>
        </p>
        <div class="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
          <div
            :class="[
              'h-1.5 rounded-full transition-all duration-300 bg-indigo-500',
              (playlistStore.importProgress.status === 'parsing' ||
               (playlistStore.importProgress.status === 'downloading' && playlistStore.importProgress.total === 0))
                ? 'animate-pulse' : ''
            ]"
            :style="{
              width: playlistStore.importProgress.total > 0 && playlistStore.importProgress.status !== 'parsing'
                ? `${Math.min((playlistStore.importProgress.current / playlistStore.importProgress.total) * 100, 100)}%`
                : '50%'
            }"
          />
        </div>
      </div>
    </div>

    <template #footer>
      <AppButton variant="ghost" @click="showImportModal = false">{{ t('manage.action.cancel') }}</AppButton>
      <AppButton :loading="playlistStore.isLoading" @click="submitImport">
        {{ t('manage.import.submit') }}
      </AppButton>
    </template>
  </AppModal>
</template>
