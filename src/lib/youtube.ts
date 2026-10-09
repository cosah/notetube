const ID_RE = /^[\w-]{11}$/

export interface ParsedVideo {
  id: string
  start?: number
}

/** Accepts watch, youtu.be, shorts, embed and live URLs, or a bare 11-character video ID. */
export function parseYouTubeUrl(input: string): ParsedVideo | null {
  const s = input.trim()
  if (!s) return null
  if (ID_RE.test(s)) return { id: s }

  let url: URL
  try {
    url = new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`)
  } catch {
    return null
  }

  const host = url.hostname.replace(/^(www|m|music)\./, '')
  let id: string | null = null
  if (host === 'youtu.be') {
    id = url.pathname.slice(1).split('/')[0]
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v')
    else id = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/)?.[1] ?? null
  }
  if (!id || !ID_RE.test(id)) return null

  const t = url.searchParams.get('t') ?? url.searchParams.get('start')
  const start = t ? parseTimeParam(t) : undefined
  return start ? { id, start } : { id }
}

/** Parses "90", "90s", "1m30s" or "1h2m3s" into seconds. */
export function parseTimeParam(t: string): number | undefined {
  if (/^\d+$/.test(t)) return Number(t)
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  if (!m || !m[0]) return undefined
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/** Spoken form for screen readers, e.g. "1 minute 5 seconds". */
export function formatTimeSpoken(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const parts: string[] = []
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h) parts.push(`${h} hour${h === 1 ? '' : 's'}`)
  if (m) parts.push(`${m} minute${m === 1 ? '' : 's'}`)
  if (sec || !parts.length) parts.push(`${sec} second${sec === 1 ? '' : 's'}`)
  return parts.join(' ')
}

/**
 * youtu.be links carry the time without an "&", which some exporters (e.g. html-to-docx)
 * double-escape and break.
 */
export function videoUrl(id: string, seconds?: number): string {
  return seconds != null ? `https://youtu.be/${id}?t=${Math.floor(seconds)}` : `https://www.youtube.com/watch?v=${id}`
}

let apiPromise: Promise<typeof YT> | null = null

export function loadYouTubeApi(): Promise<typeof YT> {
  if (apiPromise) return apiPromise
  apiPromise = new Promise((resolve, reject) => {
    if (window.YT?.Player) {
      resolve(window.YT)
      return
    }
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve(window.YT)
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = () => {
      apiPromise = null
      reject(new Error('Could not load the YouTube player. Check your connection or ad blocker.'))
    }
    document.head.appendChild(script)
  })
  return apiPromise
}
