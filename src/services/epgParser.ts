import type { EpgProgram } from '@/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Converte a string de data no formato XMLTV para um objeto Date.
 * Formato: "YYYYMMDDHHmmss ±HHMM"  ex: "20240101143000 +0300"
 */
export function parseXmltvDate(str: string): Date {
  // Remove espaços extras e separa data do offset
  const trimmed = str.trim()
  const datePart = trimmed.slice(0, 14)   // YYYYMMDDHHmmss
  const offsetPart = trimmed.slice(14).trim() // ±HHMM (opcional)

  const year   = datePart.slice(0, 4)
  const month  = datePart.slice(4, 6)
  const day    = datePart.slice(6, 8)
  const hour   = datePart.slice(8, 10)
  const minute = datePart.slice(10, 12)
  const second = datePart.slice(12, 14)

  // Monta string ISO 8601
  let iso = `${year}-${month}-${day}T${hour}:${minute}:${second}`
  if (offsetPart) {
    // "+0300" → "+03:00"
    const sign = offsetPart[0]  // + ou -
    const oh   = offsetPart.slice(1, 3)
    const om   = offsetPart.slice(3, 5)
    iso += `${sign}${oh}:${om}`
  } else {
    iso += 'Z'
  }

  return new Date(iso)
}

// ─── Parser principal ─────────────────────────────────────────────────────────

/**
 * Parseia uma string XML no formato XMLTV e retorna os programas.
 *
 * @param xml       Conteúdo XML completo do arquivo XMLTV
 * @param sourceId  ID da EpgSource à qual esses programas pertencem
 */
export function parseXmltvString(
  xml: string,
  sourceId: number,
): Omit<EpgProgram, 'id'>[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')

  // Detectar erro de parsing
  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    throw new Error(`XMLTV inválido: ${parseError.textContent?.slice(0, 100)}`)
  }

  const programmes = doc.querySelectorAll('programme')
  const results: Omit<EpgProgram, 'id'>[] = []

  programmes.forEach((prog) => {
    const channelId = prog.getAttribute('channel') ?? ''
    const startStr  = prog.getAttribute('start') ?? ''
    const stopStr   = prog.getAttribute('stop') ?? ''

    if (!channelId || !startStr || !stopStr) return

    let start: Date
    let stop: Date
    try {
      start = parseXmltvDate(startStr)
      stop  = parseXmltvDate(stopStr)
    } catch {
      return // pular programas com datas inválidas
    }

    const title       = prog.querySelector('title')?.textContent?.trim() ?? ''
    const description = prog.querySelector('desc')?.textContent?.trim() ?? ''
    const category    = prog.querySelector('category')?.textContent?.trim() ?? ''

    results.push({ sourceId, channelId, title, description, category, start, stop })
  })

  return results
}
