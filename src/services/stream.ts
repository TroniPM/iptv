import Hls from 'hls.js'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type StreamType = 'hls' | 'native' | 'unsupported'

// ─── Detecção do tipo de stream ───────────────────────────────────────────────

export function detectStreamType(url: string): StreamType {
  const clean = url.split('?')[0].toLowerCase()
  if (clean.endsWith('.mp4') || clean.endsWith('.mkv') || clean.endsWith('.avi') || clean.endsWith('.webm')) {
    return 'native'
  }
  return Hls.isSupported() ? 'hls' : 'native'
}

/**
 * Normaliza URLs Xtream Codes com extensão .ts para .m3u8,
 * permitindo que hls.js as reproduza corretamente.
 */
export function normalizeStreamUrl(url: string): string {
  const [base, query] = url.split('?')
  if (base.toLowerCase().endsWith('.ts')) {
    const normalized = base.slice(0, -3) + '.m3u8'
    return query ? `${normalized}?${query}` : normalized
  }
  return url
}

// ─── Detecção de Mixed Content ────────────────────────────────────────────────

/**
 * Retorna true quando a página está em HTTPS e a URL do stream é HTTP,
 * situação em que o navegador bloqueará a requisição (Mixed Content).
 */
export function isMixedContent(url: string): boolean {
  return (
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    url.toLowerCase().startsWith('http:')
  )
}

// ─── Preparação de URL — ponto centralizador ────────────────────────────────

/**
 * Ponto centralizador para TODAS as requisições de stream e fetch de M3U.
 * Aplica o proxy CORS quando `useProxy` é `true` e `proxyBaseUrl` está configurado.
 * Aplica upgrade HTTP→HTTPS quando `forceHttps` é `true`.
 *
 * @param url          URL original do recurso
 * @param useProxy     Se deve aplicar o proxy
 * @param proxyBaseUrl URL-base do proxy (ex: "https://proxy.com/?url=")
 * @param forceHttps   Se deve substituir http:// por https://
 */
export function prepareUrl(url: string, useProxy = false, proxyBaseUrl = '', forceHttps = false): string {
  let prepared = url
  if (forceHttps && prepared.toLowerCase().startsWith('http:')) {
    prepared = 'https:' + prepared.slice(5)
  }
  if (!useProxy || !proxyBaseUrl || !prepared) return prepared
  return `${proxyBaseUrl}${encodeURIComponent(prepared)}`
}

// ─── Montagem / desmontagem do player HLS ────────────────────────────────────

let hlsInstance: Hls | null = null

/**
 * Inicializa o stream em um elemento <video>.
 * Gerencia automaticamente a instância do hls.js.
 *
 * @param useProxy          Se o proxy CORS deve ser aplicado (deve refletir o flag proxyEnabled)
 * @param proxyUrl          URL-base do proxy
 * @param forceHttps        Se deve substituir http:// por https:// na URL
 * @param onError           Callback chamado quando ocorre um erro fatal no stream
 * @param onLevelsReady     Callback chamado quando os níveis de qualidade HLS estão disponíveis
 * @param onAutoplayBlocked Callback chamado quando o autoplay é bloqueado pelo browser
 */
export function attachStream(
  video: HTMLVideoElement,
  url: string,
  useProxy = false,
  proxyUrl = '',
  forceHttps = false,
  onError?: (message: string) => void,
  onLevelsReady?: (levels: Array<{ height?: number; width?: number; bitrate: number }>) => void,
  onAutoplayBlocked?: () => void,
): Hls | null {
  const normalizedUrl = normalizeStreamUrl(url)
  const finalUrl = prepareUrl(normalizedUrl, useProxy, proxyUrl, forceHttps)
  const type = detectStreamType(normalizedUrl)

  destroyStream()

  if (type === 'hls' && Hls.isSupported()) {
    hlsInstance = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      // Intercepta TODAS as requisições do hls.js (manifesto + segmentos + chaves).
      // Sem isso, apenas a URL do manifesto seria proxiada; os segmentos
      // continuariam sendo buscados diretamente em HTTP e seriam bloqueados.
      xhrSetup(xhr, segmentUrl) {
        const adjusted = prepareUrl(segmentUrl, useProxy, proxyUrl, forceHttps)
        if (adjusted !== segmentUrl) {
          xhr.open('GET', adjusted, true)
        }
      },
    })
    hlsInstance.loadSource(finalUrl)
    hlsInstance.attachMedia(video)
    hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {
        onAutoplayBlocked?.()
      })
      if (onLevelsReady) {
        onLevelsReady(hlsInstance!.levels)
      }
    })
    hlsInstance.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        onError?.(`Erro fatal no stream HLS: ${data.type} — ${data.details}`)
      }
    })
    return hlsInstance
  } else {
    // Fallback para vídeo nativo (MPEG-TS via MSE, MP4, etc.)
    video.src = finalUrl
    video.play().catch(() => { onAutoplayBlocked?.() })
    return null
  }
}

/**
 * Destrói a instância HLS ativa e limpa o src do vídeo.
 */
export function destroyStream(video?: HTMLVideoElement): void {
  if (hlsInstance) {
    hlsInstance.destroy()
    hlsInstance = null
  }
  if (video) {
    video.removeAttribute('src')
    video.load()
  }
}

// ─── Validação básica de URL de stream ───────────────────────────────────────

export function isValidStreamUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
