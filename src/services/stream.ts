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

// ─── Preparação de URL — ponto centralizador ────────────────────────────────

/**
 * Ponto centralizador para TODAS as requisições de stream e fetch de M3U.
 * Aplica o proxy CORS quando `useProxy` é `true` e `proxyBaseUrl` está configurado.
 *
 * @param url          URL original do recurso
 * @param useProxy     Se deve aplicar o proxy
 * @param proxyBaseUrl URL-base do proxy (ex: "https://proxy.com/?url=")
 */
export function prepareUrl(url: string, useProxy = false, proxyBaseUrl = ''): string {
  if (!useProxy || !proxyBaseUrl || !url) return url
  return `${proxyBaseUrl}${encodeURIComponent(url)}`
}

// ─── Montagem / desmontagem do player HLS ────────────────────────────────────

let hlsInstance: Hls | null = null

/**
 * Inicializa o stream em um elemento <video>.
 * Gerencia automaticamente a instância do hls.js.
 *
 * @param onError  Callback chamado quando ocorre um erro fatal no stream
 */
export function attachStream(
  video: HTMLVideoElement,
  url: string,
  proxyUrl = '',
  onError?: (message: string) => void,
): Hls | null {
  const normalizedUrl = normalizeStreamUrl(url)
  const finalUrl = prepareUrl(normalizedUrl, Boolean(proxyUrl), proxyUrl)
  const type = detectStreamType(normalizedUrl)

  destroyStream()

  if (type === 'hls' && Hls.isSupported()) {
    hlsInstance = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
    })
    hlsInstance.loadSource(finalUrl)
    hlsInstance.attachMedia(video)
    hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {
        // Autoplay pode ser bloqueado pelo browser; ignorar silenciosamente
      })
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
    video.play().catch(() => {})
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
