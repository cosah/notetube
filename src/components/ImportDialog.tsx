import { NotebookPen } from 'lucide-react'
import type { SharedNote } from '../lib/share'
import { docText } from '../lib/storage'
import { Dialog } from './Dialog'

export type ImportMode = 'replace' | 'append'

interface Props {
  note: SharedNote | null
  /** Whether this browser already has notes for the same video (or scratchpad). */
  hasExisting: boolean
  onCancel: () => void
  onImport: (mode: ImportMode) => void
}

/** Shown when the app is opened from a share link: preview the notes, then save a copy. */
export function ImportDialog({ note, hasExisting, onCancel, onImport }: Props) {
  const text = note ? docText(note.doc) : ''
  const words = text ? text.split(' ').length : 0
  const title = note?.videoId ? note.title || 'Untitled video' : 'Notes without a video'

  return (
    <Dialog
      open={note != null}
      title="Shared notes"
      onClose={onCancel}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          {hasExisting ? (
            <>
              <button type="button" className="btn" onClick={() => onImport('replace')}>
                Replace mine
              </button>
              <button type="button" className="btn btn-primary" onClick={() => onImport('append')}>
                Add below mine
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => onImport('replace')}>
              Open notes
            </button>
          )}
        </>
      }
    >
      {note && (
        <>
          <p>Someone shared these notes with you. Opening them saves a copy in this browser.</p>
          <div className="share-preview">
            {note.videoId ? (
              <img className="notes-thumb" src={`https://i.ytimg.com/vi/${note.videoId}/mqdefault.jpg`} alt="" width={112} height={63} />
            ) : (
              <span className="notes-thumb notes-thumb-scratch" aria-hidden="true">
                <NotebookPen size={22} />
              </span>
            )}
            <div className="notes-info">
              <p className="share-title">{title}</p>
              <p className="notes-meta">
                {words.toLocaleString()} {words === 1 ? 'word' : 'words'}
              </p>
              <p className="notes-preview">{text.slice(0, 240) || 'This note is empty.'}</p>
            </div>
          </div>
          {hasExisting && (
            <p className="share-conflict">
              You already have notes for {note.videoId ? 'this video' : 'the scratchpad'}. You can add the shared notes
              below yours, or replace yours with them.
            </p>
          )}
        </>
      )}
    </Dialog>
  )
}
