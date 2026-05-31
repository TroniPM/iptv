import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db } from '@/database/db'
import { parseXmltvString } from '@/services/epgParser'
import { prepareUrl } from '@/services/stream'
import type { EpgSource, EpgProgram } from '@/types'

// Tamanho do lote para bulkAdd (evita transações muito grandes)
const BATCH_SIZE = 500

export const useEpgStore = defineStore('epg', () => {
  // ─── State ─────────────────────────────────────────────────────────────────
  const sources = ref<EpgSource[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // ─── Actions ────────────────────────────────────────────────────────────────

  async function loadSources(): Promise<void> {
    sources.value = await db.epgSources.toArray()
  }

  async function addSource(name: string, url: string): Promise<void> {
    await db.epgSources.add({ name, url, lastFetched: null })
    await loadSources()
  }

  async function deleteSource(id: number): Promise<void> {
    await db.epgPrograms.where('sourceId').equals(id).delete()
    await db.epgSources.delete(id)
    await loadSources()
  }

  async function fetchEpg(source: EpgSource, proxyUrl = '', proxyEnabled = false): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const finalUrl = prepareUrl(source.url, proxyEnabled && Boolean(proxyUrl), proxyUrl)
      const response = await fetch(finalUrl)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const xml = await response.text()

      const programs = parseXmltvString(xml, source.id!)

      // Remove programas antigos desta fonte antes de inserir os novos
      await db.epgPrograms.where('sourceId').equals(source.id!).delete()

      // Insere em lotes para não travar a UI
      for (let i = 0; i < programs.length; i += BATCH_SIZE) {
        await db.epgPrograms.bulkAdd(programs.slice(i, i + BATCH_SIZE))
      }

      // Atualiza lastFetched
      const now = new Date()
      await db.epgSources.update(source.id!, { lastFetched: now })
      await loadSources()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Erro ao buscar EPG.'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function getCurrentProgram(tvgId: string): Promise<EpgProgram | null> {
    if (!tvgId) return null
    const now = new Date()
    const result = await db.epgPrograms
      .where('channelId')
      .equals(tvgId)
      .filter((p: EpgProgram) => p.start <= now && p.stop > now)
      .first()
    return result ?? null
  }

  async function getProgramsForChannel(tvgId: string, date: Date): Promise<EpgProgram[]> {
    if (!tvgId) return []
    const dayStart = new Date(date)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(date)
    dayEnd.setHours(23, 59, 59, 999)

    return db.epgPrograms
      .where('channelId')
      .equals(tvgId)
      .filter((p: EpgProgram) => p.start >= dayStart && p.start <= dayEnd)
      .sortBy('start')
  }

  async function getEpgChannelIds(): Promise<Set<string>> {
    const ids = await db.epgPrograms.orderBy('channelId').uniqueKeys()
    return new Set(ids as string[])
  }

  return {
    sources,
    isLoading,
    error,
    loadSources,
    addSource,
    deleteSource,
    fetchEpg,
    getCurrentProgram,
    getProgramsForChannel,
    getEpgChannelIds,
  }
})
