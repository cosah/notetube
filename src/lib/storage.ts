// localStorage can throw (private mode, blocked storage, quota), so every access is guarded.

const PREFIX = 'notetube:'

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function writeJSON(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function readString(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key)
  } catch {
    return null
  }
}

export function writeString(key: string, value: string | null): void {
  try {
    if (value == null) localStorage.removeItem(PREFIX + key)
    else localStorage.setItem(PREFIX + key, value)
  } catch {
    // ignore
  }
}

export interface RecentVideo {
  id: string
  title: string
  updatedAt: number
}

const RECENT_LIMIT = 20

export function getRecentVideos(): RecentVideo[] {
  return readJSON<RecentVideo[]>('recent', [])
}

export function touchRecentVideo(id: string, title?: string): RecentVideo[] {
  const list = getRecentVideos()
  const existing = list.find((v) => v.id === id)
  const entry: RecentVideo = {
    id,
    title: title || existing?.title || id,
    updatedAt: Date.now(),
  }
  const next = [entry, ...list.filter((v) => v.id !== id)].slice(0, RECENT_LIMIT)
  writeJSON('recent', next)
  return next
}

/** Notes are stored per video; `null` is the scratchpad used before any video is loaded. */
export function notesKey(videoId: string | null): string {
  return `notes:${videoId ?? '_scratch'}`
}
