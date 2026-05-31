<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { usePlaylistStore } from '@/stores/playlist'
import { useSettingsStore } from '@/stores/settings'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppToggle from '@/components/ui/AppToggle.vue'
import type { Playlist } from '@/types'

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
              class="bg-zinc-900/50 hover:bg-zinc-900 transition-colors"
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

              <td class="px-4 py-3 text-right">
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
    </section>

    <!-- ── Seção: Configurações ──────────────────────────────────── -->
    <section class="border border-zinc-800 rounded-lg p-5 space-y-5 bg-zinc-900/40">
      <h2 class="text-base font-semibold text-white">Configurações</h2>

      <!-- Agrupamento -->
      <div class="flex items-center justify-between gap-4">
        <div>
          <p class="text-sm text-zinc-200">Agrupamento Inteligente</p>
          <p class="text-xs text-zinc-500 mt-0.5">Organiza canais por <code class="bg-zinc-800 px-1 rounded">group-title</code> na lista lateral</p>
        </div>
        <AppToggle v-model="settingsStore.groupingEnabled" @update:model-value="settingsStore.toggleGrouping" />
      </div>

      <!-- Proxy -->
      <div class="space-y-2">
        <label class="text-sm text-zinc-200">URL do Proxy CORS</label>
        <p class="text-xs text-zinc-500">Prefixo adicionado antes da URL do stream para contornar restrições CORS.</p>
        <div class="flex gap-2">
          <input
            v-model="proxyDraft"
            type="url"
            placeholder="https://meu-proxy.exemplo.com/?url="
            class="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded px-3 py-2 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <AppButton variant="secondary" @click="saveProxy">Salvar</AppButton>
        </div>
        <p v-if="settingsStore.proxyUrl" class="text-xs text-emerald-400">
          ✓ Proxy ativo
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
