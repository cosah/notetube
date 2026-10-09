import { EditorContent, useEditorState, type Editor } from '@tiptap/react'
import type { ReactNode } from 'react'
import { Toolbar } from './Toolbar'

export type SaveState = { status: 'idle' } | { status: 'pending' } | { status: 'saved'; at: number } | { status: 'error' }

interface Props {
  editor: Editor | null
  saveState: SaveState
  title: string
  exportControl: ReactNode
}

function saveLabel(s: SaveState): string {
  switch (s.status) {
    case 'pending':
      return 'Saving…'
    case 'saved':
      return `Saved ${new Date(s.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    case 'error':
      return 'Couldn’t save — browser storage is full or blocked'
    default:
      return 'Saved in this browser'
  }
}

function WordCount({ editor }: { editor: Editor }) {
  const words = useEditorState({ editor, selector: ({ editor: e }) => e.storage.characterCount.words() as number })
  return <span>{words.toLocaleString()} {words === 1 ? 'word' : 'words'}</span>
}

export function NotesPane({ editor, saveState, title, exportControl }: Props) {
  return (
    <section className="pane notes-pane" aria-label="Notes">
      {editor && <Toolbar editor={editor} trailing={exportControl} />}
      <div className="editor-scroll">
        <EditorContent editor={editor} className="editor" />
      </div>
      <footer className="status-bar">
        <span className="status-title" title={title}>
          {title}
        </span>
        {editor && <WordCount editor={editor} />}
        <span className={saveState.status === 'error' ? 'status-error' : undefined}>{saveLabel(saveState)}</span>
      </footer>
    </section>
  )
}
