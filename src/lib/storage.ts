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

const SCRATCH = '_scratch'

/** Notes are stored per video; `null` is the scratchpad used before any video is loaded. */
export function notesKey(videoId: string | null): string {
  return `notes:${videoId ?? SCRATCH}`
}

// ----- Saved-notes index (titles and edit times, for the Notes browser) -----

interface NotesMeta {
  title?: string
  updatedAt: number
}

function readIndex(): Record<string, NotesMeta> {
  return readJSON<Record<string, NotesMeta>>('notes-index', {})
}

function writeIndex(index: Record<string, NotesMeta>): void {
  writeJSON('notes-index', index)
}

export function recordNotesSaved(videoId: string | null, title?: string): void {
  const index = readIndex()
  const id = videoId ?? SCRATCH
  index[id] = { title: title || index[id]?.title, updatedAt: Date.now() }
  writeIndex(index)
}

export function notesTitle(videoId: string): string {
  return readIndex()[videoId]?.title ?? ''
}

/**
 * Earlier versions kept titles in a separate "recent videos" list. Copy those into the
 * notes index for videos that have notes, then drop the old list.
 */
export function migrateRecentList(): void {
  const recent = readJSON<{ id: string; title: string; updatedAt: number }[] | null>('recent', null)
  if (!recent) return
  const index = readIndex()
  for (const r of recent) {
    if (readString(notesKey(r.id)) == null) continue
    index[r.id] = { title: index[r.id]?.title || (r.title !== r.id ? r.title : undefined), updatedAt: index[r.id]?.updatedAt ?? r.updatedAt }
  }
  writeIndex(index)
  writeString('recent', null)
}

export function recordNotesTitle(videoId: string, title: string): void {
  const index = readIndex()
  if (!index[videoId] || index[videoId].title === title) return
  index[videoId] = { ...index[videoId], title }
  writeIndex(index)
}

/** Drops a notes entry from the index only (used when an editor is emptied). */
export function removeNotesIndexEntry(videoId: string | null): void {
  const index = readIndex()
  const id = videoId ?? SCRATCH
  if (!(id in index)) return
  delete index[id]
  writeIndex(index)
}

/** Removes a set of notes. For a video, also forgets its playback position. */
export function removeNotes(videoId: string | null): void {
  writeString(notesKey(videoId), null)
  removeNotesIndexEntry(videoId)
  if (videoId) writeString(`pos:${videoId}`, null)
}

/** Plain text of a saved TipTap document, with blocks separated by spaces. */
export function docText(doc: unknown): string {
  const parts: string[] = []
  const walk = (node: { text?: string; content?: unknown[] } | null | undefined) => {
    if (!node) return
    if (node.text) parts.push(node.text)
    if (Array.isArray(node.content)) {
      node.content.forEach((child) => walk(child as typeof node))
      parts.push(' ')
    }
  }
  walk(doc as { content?: unknown[] })
  return parts.join('').replace(/\s+/g, ' ').trim()
}

export interface SavedNotes {
  videoId: string | null
  title: string
  updatedAt: number | null
  words: number
  preview: string
}

/** Every non-empty set of notes in this browser, most recently edited first. */
export function listSavedNotes(): SavedNotes[] {
  const index = readIndex()
  const result: SavedNotes[] = []
  let keys: string[] = []
  try {
    keys = Object.keys(localStorage).filter((k) => k.startsWith(`${PREFIX}notes:`))
  } catch {
    return []
  }
  for (const fullKey of keys) {
    const id = fullKey.slice(`${PREFIX}notes:`.length)
    const text = docText(readJSON<unknown>(`notes:${id}`, null))
    if (!text) continue
    const videoId = id === SCRATCH ? null : id
    result.push({
      videoId,
      title: videoId ? index[id]?.title || 'Untitled video' : 'Scratchpad',
      updatedAt: index[id]?.updatedAt ?? null,
      words: text.split(' ').filter(Boolean).length,
      preview: text.slice(0, 160),
    })
  }
  return result.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}

/** Approximate bytes NoteTube uses in localStorage (UTF-16, two bytes per character). */
export function storageBytes(): number {
  try {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .reduce((sum, k) => sum + (k.length + (localStorage.getItem(k)?.length ?? 0)) * 2, 0)
  } catch {
    return 0
  }
}
