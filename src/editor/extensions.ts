import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import TextAlign from '@tiptap/extension-text-align'
import { CharacterCount, Placeholder } from '@tiptap/extensions'
import StarterKit from '@tiptap/starter-kit'

const numberAttr = (name: string) => ({
  default: null as number | null,
  parseHTML: (el: HTMLElement) => {
    const v = el.getAttribute(`data-${name}`)
    return v == null || v === '' ? null : Number(v)
  },
  renderHTML: (attrs: Record<string, unknown>) =>
    attrs[name] == null ? {} : { [`data-${name}`]: String(attrs[name]) },
})

/**
 * Links that can also be video timestamps: `start` (and optionally `end`, for clips)
 * are kept as data attributes, while `href` stays a real YouTube URL so exported
 * notes still link to the right moment.
 */
export const NoteLink = Link.extend({
  // Typing right after a timestamp shouldn't extend the link.
  inclusive() {
    return false
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      start: numberAttr('start'),
      end: numberAttr('end'),
    }
  },
}).configure({
  openOnClick: false,
  autolink: true,
  linkOnPaste: true,
  defaultProtocol: 'https',
  HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
})

export const extensions = [
  StarterKit.configure({
    link: false,
    heading: { levels: [1, 2, 3] },
  }),
  NoteLink,
  Highlight,
  TaskList,
  TaskItem.configure({ nested: true }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Placeholder.configure({
    placeholder: 'Start typing your notes… Use “Insert timestamp” under the video to link a moment.',
  }),
  CharacterCount,
]
