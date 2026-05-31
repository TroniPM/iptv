// ─── Playlist (lista M3U) ───────────────────────────────────────────────────

export interface Playlist {
  id?: number
  name: string
  /** 'url' = importada via URL remota | 'file' = importada via arquivo local */
  source: 'url' | 'file'
  /** URL remota ou nome do arquivo */
  sourceValue: string
  /** Conteúdo bruto M3U armazenado localmente */
  rawContent: string
  createdAt: Date
  updatedAt: Date
}

// ─── Canal ──────────────────────────────────────────────────────────────────

export interface Channel {
  id?: number
  playlistId: number
  /** #EXTINF name */
  name: string
  /** tvg-logo */
  logo: string
  /** group-title */
  group: string
  /** tvg-id */
  tvgId: string
  /** tvg-name */
  tvgName: string
  /** URL do stream (HLS, MPEG-TS, etc.) */
  url: string
}

// ─── Grupo de canais (resultado do Agrupamento Inteligente) ──────────────────

export interface ChannelGroup {
  name: string
  channels: Channel[]
}

// ─── Configurações do sistema ────────────────────────────────────────────────

export interface AppSettings {
  /** Ativa o agrupamento inteligente por group-title */
  groupingEnabled: boolean
  /** Ativa o roteamento de requests pelo proxy CORS */
  proxyEnabled: boolean
  /** URL do proxy para contornar CORS (ex: "https://proxy.example.com/?url=") */
  proxyUrl: string
  /** Último canal assistido (id) */
  lastChannelId: number | null
  /** Última playlist selecionada (id) */
  lastPlaylistId: number | null
  /** Código do idioma da interface (ex: 'pt-BR', 'en-US') */
  language: string
}

// ─── Estado do Player ────────────────────────────────────────────────────────

export interface PlayerState {
  currentChannel: Channel | null
  isPlaying: boolean
  isMuted: boolean
  volume: number
  isFullscreen: boolean
  isLoading: boolean
  error: string | null
}

// ─── Estatísticas HLS (Stats for Nerds) ──────────────────────────────────────

export interface HlsStats {
  /** Bitrate atual em kbps */
  bitrate: number
  /** Resolução (ex: "1920×1080") ou "-" quando desconhecida */
  resolution: string
  /** Buffer disponível à frente do playhead em segundos */
  bufferLength: number
  /** Total acumulado de frames perdidos */
  droppedFrames: number
  /** Índice do nível de qualidade HLS (-1 = nativo/desconhecido) */
  level: number
}
