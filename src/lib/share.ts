// Share links: a whole note packed into the URL fragment (#share=1.<data>).
// The fragment is never sent to a server, so shared notes stay between the people
// who have the link. Format: base64url( deflate-raw( JSON { v, t, h } ) ), where
// v = video ID (or null), t = title and h = the note as editor HTML.

import { generateHTML, generateJSON, type JSONContent } from '@tiptap/react'
import { extensions } from '../editor/extensions'

const MARKER = '#share=1.'
/** Cap on decompressed size, so a crafted link can't expand into something huge. */
const MAX_DECODED_BYTES = 2_000_000
/** Past this length some chat apps and email clients start cutting links off. */
export const LONG_LINK_CHARS = 8000

export interface SharedNote {
  videoId: string | null
  title: string
  doc: JSONContent
}

export function isShareHash(hash: string): boolean {
  return hash.startsWith(MARKER)
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4)
  const binary = atob(b64)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function inflate(data: Uint8Array, limit: number): Promise<Uint8Array> {
  const reader = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > limit) {
      await reader.cancel()
      throw new Error('too large')
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

/** Builds a link that carries the whole note. */
export async function createShareLink(note: SharedNote): Promise<string> {
  // Attributes the editor adds back on render; dropping them keeps links shorter.
  const html = generateHTML(note.doc, extensions).replace(/ target="_blank" rel="noopener noreferrer"/g, '')
  const payload = JSON.stringify({ v: note.videoId, t: note.title, h: html })
  const packed = await deflate(new TextEncoder().encode(payload))
  return `${window.location.origin}/${MARKER}${toBase64Url(packed)}`
}

/** Decodes a share fragment. Throws a readable error if the link is damaged. */
export async function readShareHash(hash: string): Promise<SharedNote> {
  const damaged = new Error('This share link is incomplete or damaged. Ask for it to be sent again, or check that it was copied in full.')
  const data = hash.slice(MARKER.length)
  if (!data || !/^[\w-]+$/.test(data)) throw damaged

  let parsed: { v?: unknown; t?: unknown; h?: unknown }
  try {
    const bytes = await inflate(fromBase64Url(data), MAX_DECODED_BYTES)
    parsed = JSON.parse(new TextDecoder().decode(bytes))
  } catch (err) {
    if ((err as Error).message === 'too large') throw new Error('This share link is too large to open.')
    throw damaged
  }

  const videoId = parsed.v == null ? null : String(parsed.v)
  if (videoId !== null && !/^[\w-]{11}$/.test(videoId)) throw damaged
  if (typeof parsed.h !== 'string') throw damaged

  // Parsing through the editor schema drops anything it doesn't support (scripts,
  // unknown tags and attributes, javascript: links).
  const doc = generateJSON(parsed.h, extensions)
  const title = typeof parsed.t === 'string' ? parsed.t.slice(0, 300) : ''
  return { videoId, title, doc }
}
