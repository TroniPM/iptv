import Hls from 'hls.js'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type StreamType = 'hls' | 'native' | 'unsupported'

// ─── Detecção do tipo de stream ───────────────────────────────────────────────

export function detectStreamType(url: string): StreamType {
  const clean = url.split('?')[0].toLowerCase()
  if (clean.endsWith('.m3u8') || clean.includes('/hls/')) {
    return Hls.isSupported() ? 'hls' : 'native'
  }
  return 'native'
}

// ─── Aplicar proxy (se configurado) ──────────────────────────────────────────

/**
 * Prefixa a URL com o proxy, se `proxyUrl` estiver definido.
 * O proxy deve aceitar a URL de destino como parâmetro concatenado.
 * Ex: proxyUrl = "https://cors.proxy/?url=" → "https://cors.proxy/?url=<streamUrl>"
 */
export function applyProxy(streamUrl: string, proxyUrl: string): string {
  if (!proxyUrl) return streamUrl
  return `${proxyUrl}${encodeURIComponent(streamUrl)}`
}

// ─── Montagem / desmontagem do player HLS ────────────────────────────────────

let hlsInstance: Hls | null = null

/**
 * Inicializa o stream em um elemento <video>.
 * Gerencia automaticamente a instância do hls.js.
 */
export function attachStream(
  video: HTMLVideoElement,
  url: string,
  proxyUrl = '',
): void {
  const finalUrl = applyProxy(url, proxyUrl)
  const type = detectStreamType(url)

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
  } else {
    // Fallback para vídeo nativo (MPEG-TS via MSE, MP4, etc.)
    video.src = finalUrl
    video.play().catch(() => {})
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
