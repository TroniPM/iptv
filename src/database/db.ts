import Dexie, { type EntityTable } from 'dexie'
import type { Playlist, Channel, AppSettings } from '@/types'

// ─── Tipos das tabelas ───────────────────────────────────────────────────────

type PlaylistTable = EntityTable<Playlist, 'id'>
type ChannelTable = EntityTable<Channel, 'id'>

// Settings é um singleton: id sempre = 1
type SettingsRecord = AppSettings & { id: 1 }

// ─── Definição do banco ──────────────────────────────────────────────────────

class IPTVDatabase extends Dexie {
  playlists!: PlaylistTable
  channels!: ChannelTable
  settings!: EntityTable<SettingsRecord, 'id'>

  constructor() {
    super('IPTVPlayerDB')

    this.version(1).stores({
      playlists: '++id, name, source, createdAt',
      channels: '++id, playlistId, name, group, tvgId, url',
      settings: 'id',
    })

    // v2: adiciona campo language nas configurações
    this.version(2).stores({
      playlists: '++id, name, source, createdAt',
      channels: '++id, playlistId, name, group, tvgId, url',
      settings: 'id',
    }).upgrade(async (tx) => {
      await tx.table('settings').update(1, { language: 'pt-BR' })
    })
  }
}

export const db = new IPTVDatabase()

// ─── Seed de configurações padrão ────────────────────────────────────────────

db.on('ready', async () => {
  const count = await db.settings.count()
  if (count === 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.settings as any).add({
      id: 1,
      groupingEnabled: true,
      proxyEnabled: false,
      proxyUrl: '',
      lastChannelId: null,
      lastPlaylistId: null,
      language: 'pt-BR',
    } satisfies SettingsRecord)
  }
})
