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

interface SmartGroupRule {
  group: string
  patterns: RegExp[]
}

/**
 * Mapa de categorias inteligentes.
 * Os padrões são testados contra `channel.name + " " + channel.tvgName`.
 * A primeira regra que casar define o grupo.
 */
const SMART_GROUP_RULES: SmartGroupRule[] = [
  { group: 'Esportes',       patterns: [/espn/i, /sportv/i, /premiere/i, /combate/i, /fox.?sport/i, /tnt.?sport/i, /dazn/i, /band.?sport/i, /esporte/i, /futebol/i] },
  { group: 'Notícias',       patterns: [/globonews/i, /band.?news/i, /\bcnn\b/i, /record.?news/i, /sky.?news/i, /\bbbc\b/i, /jovem.?pan.?news/i] },
  { group: 'Filmes',         patterns: [/telecine/i, /\bspace\b/i, /\bwarner\b/i, /\btnt\b/i, /\bfx\b/i, /max.?prime/i, /\bhbo\b/i, /\bcinema\b/i, /\bcine\b/i] },
  { group: 'Séries',         patterns: [/\bsyfy\b/i, /\bamc\b/i, /\bstarz\b/i, /\bparamount/i, /\bapple.?tv\b/i, /\bshowtime\b/i] },
  { group: 'Infantil',       patterns: [/cartoon/i, /discovery.?kids/i, /\bnick\b/i, /nickelodeon/i, /\bgloob\b/i, /disney.?jr/i, /baby.?tv/i, /\bboomerang\b/i] },
  { group: 'Documentários',  patterns: [/\bdiscovery\b/i, /nat.?geo/i, /national.?geo/i, /\bhistory\b/i, /animal.?planet/i] },
  { group: 'Entretenimento', patterns: [/multishow/i, /\bmtv\b/i, /\bvh1\b/i, /universal.?tv/i, /\bsony\b/i, /\btlc\b/i, /comedy.?central/i] },
  { group: 'Música',         patterns: [/\bvevo\b/i, /\bmezzo\b/i, /music\b/i, /\bmúsica\b/i, /\bpalco\b/i] },
  { group: 'Variedades',     patterns: [/\bglobo\b/i, /\bsbt\b/i, /\brecord\b/i, /\bband\b/i, /\bredetv\b/i, /\bcultura\b/i] },
  { group: 'Religioso',      patterns: [/rede.?vida/i, /tv.?aparecida/i, /cancao.?nova/i, /cançao.?nova/i, /engrace/i] },
]

/**
 * Retorna a categoria inteligente para um canal com base no nome e tvg-name.
 * Retorna `null` quando nenhuma regra casar (usa o group-title original como fallback).
 */
export function getSmartGroup(channel: Channel): string | null {
  const haystack = `${channel.name} ${channel.tvgName}`.toLowerCase()
  for (const rule of SMART_GROUP_RULES) {
    if (rule.patterns.some((p) => p.test(haystack))) return rule.group
  }
  return null
}

/**
 * Agrupa canais por categoria inteligente ou pelo `group-title` original.
 * @param useSmartGrouping Quando `true`, SMART_GROUP_RULES sobrescrevem o group-title visualmente.
 */
export function groupChannels(channels: Channel[], useSmartGrouping = false): ChannelGroup[] {
  const map = new Map<string, Channel[]>()

  for (const ch of channels) {
    const smartKey = useSmartGrouping ? getSmartGroup(ch) : null
    const key = smartKey ?? (ch.group.trim() || 'Sem grupo')
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(ch)
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, chs]) => ({ name, channels: chs }))
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
