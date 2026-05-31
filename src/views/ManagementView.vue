<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { usePlaylistStore } from '@/stores/playlist'
import { useSettingsStore } from '@/stores/settings'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppToggle from '@/components/ui/AppToggle.vue'
import { db } from '@/database/db'
import type { Playlist, Channel } from '@/types'

const playlistStore = usePlaylistStore()
const settingsStore = useSettingsStore()

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
    importError.value = 'Informe um nome para a lista.'
    return
  }
  try {
    if (importTab.value === 'url') {
      if (!importUrl.value.trim()) {
        importError.value = 'Informe a URL da lista M3U.'
        return
      }
      await playlistStore.importFromUrl(importUrl.value.trim(), importName.value.trim())
    } else {
      if (!importText.value.trim()) {
        importError.value = 'Nenhum arquivo selecionado ou conteúdo vazio.'
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
    importError.value = playlistStore.error ?? 'Erro desconhecido ao importar.'
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
  if (!confirm(`Excluir a lista "${pl.name}" e todos os seus canais?`)) return
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
  // Manter apenas grupos expandidos que ainda existem e recarregar seus canais
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
  if (!confirm(`Excluir o grupo "${groupName}" e seus ${toDelete.length} canal(is)?`)) return
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

// ─── Configurações ────────────────────────────────────────────────────────────
const proxyDraft = ref('')

async function saveProxy() {
  await settingsStore.save({ proxyUrl: proxyDraft.value.trim() })
}

// ─── Init ─────────────────────────────────────────────────────────────────────
onMounted(async () => {
  await settingsStore.load()
  await playlistStore.loadPlaylists()
  proxyDraft.value = settingsStore.proxyUrl
})
</script>

<template>
  <div class="min-h-[calc(100svh-3.5rem)] bg-zinc-950 p-4 md:p-8 space-y-8">
    <!-- ── Seção: Listas ─────────────────────────────────────────── -->
    <section>
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-lg font-semibold text-white">Minhas Listas M3U</h1>
        <AppButton @click="openImport">+ Importar Lista</AppButton>
      </div>

      <!-- Empty state -->
      <div
        v-if="playlistStore.playlists.length === 0"
        class="border-2 border-dashed border-zinc-700 rounded-lg p-10 text-center text-zinc-600"
      >
        <p class="text-sm">Nenhuma lista importada.</p>
        <p class="text-xs mt-1">Clique em "Importar Lista" para começar.</p>
      </div>

      <!-- Tabela de listas -->
      <div v-else class="overflow-x-auto rounded-lg border border-zinc-800">
        <table class="w-full text-sm text-zinc-300">
          <thead class="bg-zinc-900 text-zinc-500 text-xs uppercase tracking-wider">
            <tr>
              <th class="px-4 py-3 text-left">Nome</th>
              <th class="px-4 py-3 text-left hidden md:table-cell">Origem</th>
              <th class="px-4 py-3 text-left hidden lg:table-cell">Adicionada em</th>
              <th class="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-800">
            <tr
              v-for="pl in playlistStore.playlists"
              :key="pl.id"
              class="bg-zinc-900/50 hover:bg-zinc-900 transition-colors cursor-pointer select-none"
              :class="{ 'ring-1 ring-inset ring-indigo-500 bg-zinc-900': managePl?.id === pl.id }"
              @click="selectForManage(pl)"
            >
              <!-- Nome (editável inline) -->
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
                  {{ pl.source === 'url' ? '🌐 URL' : '📁 Arquivo' }}
                </span>
              </td>

              <td class="px-4 py-3 hidden lg:table-cell text-zinc-500 text-xs">
                {{ new Date(pl.createdAt).toLocaleDateString('pt-BR') }}
              </td>

              <td class="px-4 py-3 text-right" @click.stop>
                <div class="flex items-center justify-end gap-2">
                  <template v-if="editingPlaylist?.id === pl.id">
                    <AppButton size="sm" @click="saveEdit">Salvar</AppButton>
                    <AppButton size="sm" variant="ghost" @click="editingPlaylist = null">Cancelar</AppButton>
                  </template>
                  <template v-else>
                    <AppButton size="sm" variant="secondary" @click="startEdit(pl)">Renomear</AppButton>
                    <AppButton size="sm" variant="danger" @click="confirmDelete(pl)">Excluir</AppButton>
                  </template>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ── Painel de gerenciamento da lista selecionada ─────────── -->
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="opacity-0 -translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition-all duration-150 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-2"
      >
        <div v-if="managePl" class="mt-2 rounded-lg border border-zinc-700 bg-zinc-900 overflow-hidden">
          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-zinc-800/40">
            <h2 class="text-sm font-semibold text-zinc-200">
              Gerenciar: <span class="text-white">{{ managePl.name }}</span>
            </h2>
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
              {{ tab === 'geral' ? '⚙ Geral' : '📂 Grupos' }}
            </button>
          </div>

          <!-- Tab: Geral -->
          <div v-if="manageTab === 'geral'" class="p-5 space-y-5">
            <!-- Renomear -->
            <div class="space-y-2">
              <label class="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Renomear lista</label>
              <div class="flex gap-2">
                <input
                  v-model="manageName"
                  type="text"
                  class="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  @keyup.enter="saveManageName"
                />
                <AppButton :loading="manageRenameLoading" @click="saveManageName">Salvar</AppButton>
              </div>
            </div>

            <!-- Excluir -->
            <div class="pt-4 border-t border-zinc-800">
              <p class="text-xs text-zinc-500 mb-3">Zona de perigo — esta ação não pode ser desfeita.</p>
              <AppButton variant="danger" @click="confirmDelete(managePl)">Excluir Lista</AppButton>
            </div>
          </div>

          <!-- Tab: Grupos -->
          <div v-if="manageTab === 'grupos'" class="p-5 space-y-4">
            <!-- Loading -->
            <div v-if="manageLoading" class="text-zinc-500 text-sm py-6 text-center">Carregando grupos...</div>

            <!-- Empty -->
            <div v-else-if="manageGroups.length === 0" class="text-zinc-600 text-sm py-6 text-center">
              Nenhum grupo encontrado nesta lista.
            </div>

            <!-- Acordeão de grupos -->
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
                <!-- Cabeçalho do grupo -->
                <div
                  class="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-zinc-800/60 select-none"
                  @click="toggleGroup(g.name)"
                >
                  <!-- Seta de expansão -->
                  <svg
                    class="w-3.5 h-3.5 text-zinc-500 shrink-0 transition-transform duration-150"
                    :class="expandedGroups.includes(g.name) ? 'rotate-90' : ''"
                    xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                  >
                    <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd"/>
                  </svg>

                  <!-- Nome (ou input de renomear) -->
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

                  <!-- Badge contagem -->
                  <span class="text-xs text-zinc-500 shrink-0 tabular-nums">{{ g.count }} canal(is)</span>

                  <!-- Indicador de drop ativo -->
                  <span v-if="dragOverGroup === g.name" class="text-xs text-indigo-400 shrink-0 animate-pulse">
                    ↙ Soltar aqui
                  </span>

                  <!-- Ações do grupo -->
                  <div class="flex items-center gap-1.5 shrink-0 ml-1" @click.stop>
                    <template v-if="renamingGroup === g.name">
                      <AppButton size="sm" @click="saveRenameGroup">Salvar</AppButton>
                      <AppButton size="sm" variant="ghost" @click="renamingGroup = null">Cancelar</AppButton>
                    </template>
                    <template v-else>
                      <AppButton size="sm" variant="secondary" @click="startRenameGroup(g.name)">Renomear</AppButton>
                      <AppButton size="sm" variant="danger" @click="deleteGroup(g.name)">Excluir</AppButton>
                    </template>
                  </div>
                </div>

                <!-- Lista de canais (expandida) -->
                <div v-if="expandedGroups.includes(g.name)" class="border-t border-zinc-800/60 bg-zinc-950/50">
                  <div v-if="!groupChannelsCache[g.name]" class="px-4 py-2 text-xs text-zinc-600 italic">
                    Carregando canais...
                  </div>
                  <div v-else-if="groupChannelsCache[g.name].length === 0" class="px-4 py-2 text-xs text-zinc-600 italic">
                    Grupo sem canais.
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
                    <!-- Ícone de arrastar (grip) -->
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
                + Criar novo grupo
              </button>
              <div v-else class="space-y-3">
                <p class="text-xs text-zinc-400">Move todos os canais de um grupo existente para o novo nome de grupo.</p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs text-zinc-500 mb-1">Nome do novo grupo</label>
                    <input
                      v-model="newGroupName"
                      type="text"
                      placeholder="Ex: Esportes HD"
                      class="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded px-3 py-2 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label class="block text-xs text-zinc-500 mb-1">Mover canais do grupo</label>
                    <select
                      v-model="newGroupSource"
                      class="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="" disabled>Selecione um grupo...</option>
                      <option v-for="g in manageGroups" :key="g.name" :value="g.name">
                        {{ g.name }} ({{ g.count }})
                      </option>
                    </select>
                  </div>
                </div>
                <div class="flex gap-2">
                  <AppButton :disabled="!newGroupName.trim() || !newGroupSource" @click="submitCreateGroup">
                    Criar Grupo
                  </AppButton>
                  <AppButton variant="ghost" @click="showCreateGroup = false; newGroupName = ''; newGroupSource = ''">
                    Cancelar
                  </AppButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </section>

    <!-- ── Seção: Configurações ──────────────────────────────────── -->
    <section class="border border-zinc-800 rounded-lg p-5 space-y-5 bg-zinc-900/40">
      <h2 class="text-base font-semibold text-white">Configurações</h2>

      <!-- Agrupamento -->
      <div class="flex items-center justify-between gap-4">
        <div>
          <p class="text-sm text-zinc-200">Agrupamento Inteligente</p>
          <p class="text-xs text-zinc-500 mt-0.5">Categoriza canais automaticamente por palavras-chave (ex: ESPN → Esportes). Desativado exibe lista plana.</p>
        </div>
        <AppToggle v-model="settingsStore.groupingEnabled" @update:model-value="settingsStore.toggleGrouping" />
      </div>

      <!-- Proxy -->
      <div class="space-y-3">
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-sm text-zinc-200">Proxy CORS</p>
            <p class="text-xs text-zinc-500 mt-0.5">Roteia streams e downloads de lista pelo proxy para contornar restrições CORS.</p>
          </div>
          <AppToggle
            v-model="settingsStore.proxyEnabled"
            :disabled="!settingsStore.proxyUrl"
            @update:model-value="settingsStore.toggleProxy"
          />
        </div>

        <div class="flex gap-2">
          <input
            v-model="proxyDraft"
            type="url"
            placeholder="https://meu-proxy.exemplo.com/?url="
            :disabled="settingsStore.proxyEnabled"
            class="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded px-3 py-2 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <AppButton
            variant="secondary"
            :disabled="settingsStore.proxyEnabled"
            @click="saveProxy"
          >
            Salvar
          </AppButton>
        </div>

        <p v-if="settingsStore.proxyEnabled && settingsStore.proxyUrl" class="text-xs text-emerald-400">
          ✓ Proxy ativo
        </p>
        <p v-else-if="settingsStore.proxyUrl && !settingsStore.proxyEnabled" class="text-xs text-zinc-500">
          Proxy configurado, mas desativado.
        </p>
        <p v-else-if="!settingsStore.proxyUrl" class="text-xs text-zinc-600">
          Configure uma URL para habilitar o proxy.
        </p>
      </div>
    </section>

    <!-- ── Modal de importação ──────────────────────────────────── -->
    <AppModal
      v-if="showImportModal"
      title="Importar Lista M3U"
      @close="showImportModal = false"
    >
      <!-- Tabs -->
      <div class="flex border-b border-zinc-800 mb-4 -mx-5 px-5">
        <button
          v-for="tab in (['url', 'file'] as const)"
          :key="tab"
          class="px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px"
          :class="
            importTab === tab
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          "
          @click="importTab = tab"
        >
          {{ tab === 'url' ? '🌐 Via URL' : '📁 Via Arquivo' }}
        </button>
      </div>

      <!-- Nome -->
      <div class="space-y-3">
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Nome da lista *</label>
          <input
            v-model="importName"
            type="text"
            placeholder="Ex: Minha TV"
            class="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded px-3 py-2 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <!-- URL -->
        <div v-if="importTab === 'url'">
          <label class="block text-xs text-zinc-400 mb-1">URL do arquivo M3U *</label>
          <input
            v-model="importUrl"
            type="url"
            placeholder="https://exemplo.com/lista.m3u"
            class="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded px-3 py-2 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <!-- Arquivo -->
        <div v-else>
          <label class="block text-xs text-zinc-400 mb-1">Arquivo .m3u / .m3u8 *</label>
          <input
            type="file"
            accept=".m3u,.m3u8,.txt"
            class="w-full text-sm text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-zinc-700 file:text-zinc-200 file:text-xs hover:file:bg-zinc-600 cursor-pointer"
            @change="handleFileChange"
          />
        </div>

        <!-- Erro -->
        <p v-if="importError" class="text-xs text-red-400">{{ importError }}</p>
      </div>

      <template #footer>
        <AppButton variant="ghost" @click="showImportModal = false">Cancelar</AppButton>
        <AppButton :loading="playlistStore.isLoading" @click="submitImport">
          Importar
        </AppButton>
      </template>
    </AppModal>
  </div>
</template>
