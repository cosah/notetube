import type { Editor } from '@tiptap/react'
import { formatTime, videoUrl } from '../lib/youtube'

export function timestampLabel(start: number, end?: number | null): string {
  return end == null ? `[${formatTime(start)}]` : `[${formatTime(start)}–${formatTime(end)}]`
}

/**
 * Inserts a timestamp (or clip) link at the editor's last cursor position, then leaves
 * the cursor just after it. ProseMirror keeps the selection while the editor is blurred,
 * so this works even though the user clicked a button outside the editor.
 */
export function insertTimestamp(editor: Editor, videoId: string, start: number, end?: number) {
  const s = Math.floor(start)
  const e = end == null ? null : Math.floor(end)
  const { to } = editor.state.selection
  const before = editor.state.doc.textBetween(Math.max(0, to - 1), to, '\n', '\n')
  const needsLeadingSpace = before !== '' && !/\s/.test(before)

  editor
    .chain()
    .focus()
    .setTextSelection(to)
    .insertContent([
      ...(needsLeadingSpace ? [{ type: 'text', text: ' ' }] : []),
      {
        type: 'text',
        text: timestampLabel(s, e),
        marks: [{ type: 'link', attrs: { href: videoUrl(videoId, s), start: s, end: e } }],
      },
      { type: 'text', text: ' ' },
    ])
    .unsetMark('link')
    .run()
}

export interface Moment {
  start: number
  end: number | null
  label: string
  context: string
  pos: number
}

/** Collects every timestamp link in the document, in document order. */
export function collectMoments(editor: Editor): Moment[] {
  const moments: Moment[] = []
  editor.state.doc.descendants((node, pos, parent) => {
    if (!node.isText) return
    const link = node.marks.find((m) => m.type.name === 'link' && m.attrs.start != null)
    if (!link) return
    const context = (parent?.textContent ?? '').replace(node.text ?? '', '').trim()
    moments.push({
      start: link.attrs.start as number,
      end: (link.attrs.end as number | null) ?? null,
      label: node.text ?? '',
      context,
      pos,
    })
  })
  return moments
}
