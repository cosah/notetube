import { NotebookPen, Share, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { listSavedNotes, storageBytes, type SavedNotes } from '../lib/storage'
import { Dialog } from './Dialog'

interface Props {
  open: boolean
  currentVideoId: string | null
  onClose: () => void
  onOpenNotes: (videoId: string | null) => void
  onDeleteNotes: (videoId: string | null) => void
  onDeleteAll: () => void
  onShareNotes: (videoId: string | null) => void
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const rowKey = (n: SavedNotes) => n.videoId ?? '_scratch'

/** Overlay listing every saved set of notes in this browser, to reopen or delete them. */
export function NotesBrowser({ open, currentVideoId, onClose, onOpenNotes, onDeleteNotes, onDeleteAll, onShareNotes }: Props) {
  const [version, setVersion] = useState(0)
  const [confirming, setConfirming] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  // Re-read storage whenever the dialog opens or something is deleted.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const notes = useMemo(() => (open ? listSavedNotes() : []), [open, version])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const bytes = useMemo(() => (open ? storageBytes() : 0), [open, version])

  useEffect(() => {
    if (!open) setConfirming(null)
  }, [open])

  useEffect(() => {
    confirmRef.current?.focus()
  }, [confirming])

  const remove = (key: string, videoId: string | null) => {
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-row]') ?? [])
    const i = rows.findIndex((r) => r.dataset.row === key)
    onDeleteNotes(videoId)
    setConfirming(null)
    setVersion((v) => v + 1)
    // Keep focus in the list: move to the next row's Open button (or the previous one).
    requestAnimationFrame(() => {
      const next = listRef.current?.querySelectorAll<HTMLElement>('.notes-open')
      const target = next?.[Math.min(i, (next?.length ?? 1) - 1)]
      if (target) target.focus()
      else document.querySelector<HTMLElement>('.dialog[open] .dialog-header button')?.focus()
    })
  }

  return (
    <Dialog
      open={open}
      title="Your notes"
      onClose={onClose}
      wide
      footer={
        notes.length > 0 ? (
          <>
            <span className="storage-used">
              Saved only in this browser · {formatBytes(bytes)}
            </span>
            <span className="spacer" />
            {confirming === '*' ? (
              <>
                <span className="confirm-text" id="confirm-all">Delete all {notes.length} notes?</span>
                <button type="button" className="btn" onClick={() => setConfirming(null)}>
                  Cancel
                </button>
                <button
                  ref={confirmRef}
                  type="button"
                  className="btn btn-danger"
                  aria-describedby="confirm-all"
                  onClick={() => {
                    onDeleteAll()
                    setConfirming(null)
                    setVersion((v) => v + 1)
                  }}
                >
                  Delete all
                </button>
              </>
            ) : (
              <button type="button" className="btn" onClick={() => setConfirming('*')}>
                <Trash2 aria-hidden="true" size={16} />
                Delete all…
              </button>
            )}
          </>
        ) : undefined
      }
    >
      {notes.length === 0 ? (
        <p className="notes-empty">
          No saved notes yet. Notes save automatically as you type, separately for each video, and they’ll appear here.
        </p>
      ) : (
        <ul className="notes-list" ref={listRef}>
          {notes.map((n) => {
            const key = rowKey(n)
            const isCurrent = n.videoId === currentVideoId
            const confirmId = `confirm-${key}`
            return (
              <li key={key} data-row={key} className="notes-row" aria-current={isCurrent ? 'true' : undefined}>
                {n.videoId ? (
                  <img className="notes-thumb" src={`https://i.ytimg.com/vi/${n.videoId}/mqdefault.jpg`} alt="" loading="lazy" width={112} height={63} />
                ) : (
                  <span className="notes-thumb notes-thumb-scratch" aria-hidden="true">
                    <NotebookPen size={22} />
                  </span>
                )}
                <div className="notes-info">
                  <button
                    type="button"
                    className="notes-open"
                    onClick={() => {
                      onOpenNotes(n.videoId)
                      onClose()
                    }}
                  >
                    {n.title}
                  </button>
                  <p className="notes-meta">
                    {isCurrent && <span className="badge">Open now</span>}
                    {n.updatedAt ? `Edited ${dateFormat.format(n.updatedAt)}` : 'Edited earlier'} · {n.words.toLocaleString()}{' '}
                    {n.words === 1 ? 'word' : 'words'}
                  </p>
                  <p className="notes-preview">{n.preview}</p>
                </div>
                <div className="notes-actions">
                  {confirming === key ? (
                    <>
                      <span className="confirm-text" id={confirmId}>Delete?</span>
                      <button type="button" className="btn" onClick={() => setConfirming(null)}>
                        Cancel
                      </button>
                      <button
                        ref={confirmRef}
                        type="button"
                        className="btn btn-danger"
                        aria-describedby={confirmId}
                        aria-label={`Delete notes for ${n.title}`}
                        onClick={() => remove(key, n.videoId)}
                      >
                        Delete
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn btn-icon btn-ghost"
                        aria-label={`Copy share link for ${n.title}`}
                        title="Copy a link that shares these notes"
                        onClick={() => onShareNotes(n.videoId)}
                      >
                        <Share aria-hidden="true" size={17} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-icon btn-ghost"
                        aria-label={`Delete notes for ${n.title}`}
                        title="Delete these notes"
                        onClick={() => setConfirming(key)}
                      >
                        <Trash2 aria-hidden="true" size={17} />
                      </button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Dialog>
  )
}
