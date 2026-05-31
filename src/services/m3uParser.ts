import type { Channel, ChannelGroup } from '@/types'

// ─── Regex para linha #EXTINF ────────────────────────────────────────────────

const EXTINF_RE = /^#EXTINF[^,]*,(.*)$/
const ATTR_RE = (attr: string) =>
  new RegExp(`${attr}="([^"]*)"`, 'i')

function extractAttr(line: string, attr: string): string {
  return ATTR_RE(attr).exec(line)?.[1] ?? ''
}

// ─── Parser principal ────────────────────────────────────────────────────────

/**
 * Converte o conteúdo bruto de um arquivo M3U em um array de canais.
 * Suporta atributos: tvg-id, tvg-name, tvg-logo, group-title.
 */
export function parseM3U(raw: string, playlistId: number): Channel[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const channels: Channel[] = []
  let pending: Omit<Channel, 'url'> | null = null

  for (const line of lines) {
    if (line.startsWith('#EXTINF')) {
      const nameMatch = EXTINF_RE.exec(line)
      pending = {
        playlistId,
        name: nameMatch?.[1]?.trim() ?? 'Sem nome',
        logo: extractAttr(line, 'tvg-logo'),
        group: extractAttr(line, 'group-title'),
        tvgId: extractAttr(line, 'tvg-id'),
        tvgName: extractAttr(line, 'tvg-name'),
      }
    } else if (!line.startsWith('#') && pending) {
      channels.push({ ...pending, url: line })
      pending = null
    }
  }

  return channels
}

// ─── Agrupamento inteligente ─────────────────────────────────────────────────

/**
 * Agrupa um array de canais pelo campo `group`.
 * Canais sem grupo vão para "Sem grupo".
 */
export function groupChannels(channels: Channel[]): ChannelGroup[] {
  const map = new Map<string, Channel[]>()

  for (const ch of channels) {
    const key = ch.group.trim() || 'Sem grupo'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(ch)
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, channels]) => ({ name, channels }))
}

// ─── Busca com filtro por nome ────────────────────────────────────────────────

export function filterChannels(channels: Channel[], query: string): Channel[] {
  const q = query.toLowerCase().trim()
  if (!q) return channels
  return channels.filter(
    (ch) =>
      ch.name.toLowerCase().includes(q) ||
      ch.group.toLowerCase().includes(q),
  )
}
