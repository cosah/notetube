import { useEditorState, type Editor } from '@tiptap/react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Highlighter,
  Italic,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  RemoveFormatting,
  SquareCode,
  Strikethrough,
  Underline,
  Undo2,
  type LucideIcon,
} from 'lucide-react'
import { useId, type MouseEvent, type ReactNode } from 'react'

const keepFocus = (e: MouseEvent) => e.preventDefault()
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl+'

function ToolButton(props: {
  icon: LucideIcon
  label: string
  shortcut?: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  const Icon = props.icon
  return (
    <button
      type="button"
      className="btn btn-icon btn-ghost"
      onMouseDown={keepFocus}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.label}
      aria-pressed={props.active === undefined ? undefined : props.active}
      aria-keyshortcuts={props.shortcut?.replace('⌘', 'Meta+')}
      title={props.shortcut ? `${props.label} (${props.shortcut})` : props.label}
    >
      <Icon aria-hidden="true" size={17} />
    </button>
  )
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="tool-group" role="group" aria-label={label}>
      {children}
    </div>
  )
}

export function Toolbar({ editor, trailing }: { editor: Editor; trailing?: ReactNode }) {
  const blockId = useId()
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: e.isActive('heading', { level: 1 })
        ? 'h1'
        : e.isActive('heading', { level: 2 })
          ? 'h2'
          : e.isActive('heading', { level: 3 })
            ? 'h3'
            : 'p',
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      highlight: e.isActive('highlight'),
      code: e.isActive('code'),
      link: e.isActive('link'),
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
      taskList: e.isActive('taskList'),
      blockquote: e.isActive('blockquote'),
      codeBlock: e.isActive('codeBlock'),
      alignCenter: e.isActive({ textAlign: 'center' }),
      alignRight: e.isActive({ textAlign: 'right' }),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  })

  const chain = () => editor.chain().focus()

  const setBlock = (value: string) => {
    if (value === 'p') chain().setParagraph().run()
    else chain().setHeading({ level: Number(value[1]) as 1 | 2 | 3 }).run()
  }

  const editLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Link address (leave empty to remove the link)', previous ?? 'https://')
    if (url === null) return
    if (url.trim() === '' || url.trim() === 'https://') {
      chain().extendMarkRange('link').unsetLink().run()
      return
    }
    const href = /^[a-z][a-z0-9+.-]*:/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`
    if (editor.state.selection.empty && !s.link) {
      chain().insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run()
    } else {
      chain().extendMarkRange('link').setLink({ href }).run()
    }
  }

  return (
    <div className="toolbar">
      <Group label="History">
        <ToolButton icon={Undo2} label="Undo" shortcut={`${mod}Z`} disabled={!s.canUndo} onClick={() => chain().undo().run()} />
        <ToolButton icon={Redo2} label="Redo" shortcut={isMac ? '⌘⇧Z' : 'Ctrl+Y'} disabled={!s.canRedo} onClick={() => chain().redo().run()} />
      </Group>

      <Group label="Text style">
        <label htmlFor={blockId} className="sr-only">
          Text style
        </label>
        <select id={blockId} className="block-select" value={s.block} onChange={(e) => setBlock(e.target.value)}>
          <option value="p">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>
      </Group>

      <Group label="Formatting">
        <ToolButton icon={Bold} label="Bold" shortcut={`${mod}B`} active={s.bold} onClick={() => chain().toggleBold().run()} />
        <ToolButton icon={Italic} label="Italic" shortcut={`${mod}I`} active={s.italic} onClick={() => chain().toggleItalic().run()} />
        <ToolButton icon={Underline} label="Underline" shortcut={`${mod}U`} active={s.underline} onClick={() => chain().toggleUnderline().run()} />
        <ToolButton icon={Strikethrough} label="Strikethrough" active={s.strike} onClick={() => chain().toggleStrike().run()} />
        <ToolButton icon={Highlighter} label="Highlight" active={s.highlight} onClick={() => chain().toggleHighlight().run()} />
        <ToolButton icon={Code} label="Inline code" active={s.code} onClick={() => chain().toggleCode().run()} />
        <ToolButton icon={LinkIcon} label="Link" active={s.link} onClick={editLink} />
      </Group>

      <Group label="Lists and blocks">
        <ToolButton icon={List} label="Bulleted list" active={s.bulletList} onClick={() => chain().toggleBulletList().run()} />
        <ToolButton icon={ListOrdered} label="Numbered list" active={s.orderedList} onClick={() => chain().toggleOrderedList().run()} />
        <ToolButton icon={ListChecks} label="Checklist" active={s.taskList} onClick={() => chain().toggleTaskList().run()} />
        <ToolButton icon={Quote} label="Quote" active={s.blockquote} onClick={() => chain().toggleBlockquote().run()} />
        <ToolButton icon={SquareCode} label="Code block" active={s.codeBlock} onClick={() => chain().toggleCodeBlock().run()} />
        <ToolButton icon={Minus} label="Divider" onClick={() => chain().setHorizontalRule().run()} />
      </Group>

      <Group label="Alignment">
        <ToolButton icon={AlignLeft} label="Align left" active={!s.alignCenter && !s.alignRight} onClick={() => chain().unsetTextAlign().run()} />
        <ToolButton icon={AlignCenter} label="Align center" active={s.alignCenter} onClick={() => chain().setTextAlign('center').run()} />
        <ToolButton icon={AlignRight} label="Align right" active={s.alignRight} onClick={() => chain().setTextAlign('right').run()} />
      </Group>

      <Group label="Clear">
        <ToolButton icon={RemoveFormatting} label="Clear formatting" onClick={() => chain().unsetAllMarks().clearNodes().run()} />
      </Group>

      {trailing && <div className="toolbar-trailing">{trailing}</div>}
    </div>
  )
}
