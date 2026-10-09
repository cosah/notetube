import type { Transaction } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/react'
import { Crosshair } from 'lucide-react'
import { useEffect, useState } from 'react'
import { collectMoments, type Moment } from '../editor/timestamps'
import type { VideoController } from '../lib/videoController'
import { formatTimeSpoken } from '../lib/youtube'

interface Props {
  editor: Editor | null
  controller: VideoController
  currentTime: number
  ready: boolean
}

/** Index of every timestamp in the notes, so you can jump around the video from one place. */
export function MomentsList({ editor, controller, currentTime, ready }: Props) {
  const [moments, setMoments] = useState<Moment[]>([])

  useEffect(() => {
    if (!editor) return
    const refresh = () => setMoments(collectMoments(editor))
    const onTransaction = ({ transaction }: { transaction: Transaction }) => {
      if (transaction.docChanged || transaction.getMeta('notetube:loaded')) refresh()
    }
    refresh()
    editor.on('transaction', onTransaction)
    return () => {
      editor.off('transaction', onTransaction)
    }
  }, [editor])

  const sorted = [...moments].sort((a, b) => a.start - b.start)
  // The moment the playhead is currently in: the latest one that has started.
  const current = ready ? sorted.filter((m) => m.start <= currentTime + 0.5).at(-1) : undefined

  const play = (m: Moment) => {
    controller.clearTypingPause()
    if (m.end != null) controller.playClip(m.start, m.end)
    else controller.seek(m.start, true)
  }

  const reveal = (m: Moment) => {
    if (!editor) return
    editor.chain().focus().setTextSelection(m.pos + m.label.length).scrollIntoView().run()
  }

  return (
    <section className="moments" aria-labelledby="moments-heading">
      <h2 id="moments-heading" className="moments-heading">
        Timestamps in your notes <span className="count">{moments.length}</span>
      </h2>
      {sorted.length === 0 ? (
        <p className="moments-empty">None yet. Click “Insert timestamp” while you watch and each moment will be listed here.</p>
      ) : (
        <ol className="moments-list">
          {sorted.map((m) => (
            <li key={`${m.pos}-${m.start}`} className="moment" aria-current={m === current ? 'true' : undefined}>
              <button
                type="button"
                className="moment-play"
                onClick={() => play(m)}
                aria-label={`Play from ${formatTimeSpoken(m.start)}${m.end != null ? ` to ${formatTimeSpoken(m.end)}` : ''}${m.context ? `: ${m.context}` : ''}`}
              >
                <span className="moment-time">{m.label.replace(/^\[|\]$/g, '')}</span>
                <span className="moment-context">{m.context || <em>No note text</em>}</span>
              </button>
              <button type="button" className="btn btn-icon btn-ghost" onClick={() => reveal(m)} aria-label={`Show ${m.label} in notes`} title="Show in notes">
                <Crosshair aria-hidden="true" size={16} />
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
