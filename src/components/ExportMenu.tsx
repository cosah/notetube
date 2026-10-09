import { ChevronDown, Download, FileCode, FileText, FileType, Loader2, Settings, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { ExportFormat } from '../lib/exporters'

interface Props {
  busy: ExportFormat | null
  googleConfigured: boolean
  onExport: (format: ExportFormat) => void
  onGoogleSetup: () => void
}

const ITEMS: { format: ExportFormat; label: string; hint: string; icon: LucideIcon }[] = [
  { format: 'txt', label: 'Plain text', hint: '.txt', icon: FileText },
  { format: 'md', label: 'Markdown', hint: '.md', icon: FileCode },
  { format: 'docx', label: 'Word', hint: '.docx', icon: FileType },
  { format: 'pdf', label: 'PDF', hint: '.pdf', icon: FileType },
  { format: 'gdoc', label: 'Google Docs', hint: 'opens in Drive', icon: FileText },
]

/** Disclosure-style menu: a button that reveals a list of export buttons. */
export function ExportMenu({ busy, googleConfigured, onExport, onGoogleSetup }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector('button')?.focus()
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return
    const buttons = Array.from(listRef.current?.querySelectorAll('button') ?? [])
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next =
      e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
    buttons[next]?.focus()
    e.preventDefault()
  }

  return (
    <div className="export-menu" ref={rootRef} onKeyDown={onKeyDown} onBlur={(e) => {
      if (open && !rootRef.current?.contains(e.relatedTarget as Node)) setOpen(false)
    }}>
      <button
        ref={triggerRef}
        type="button"
        className="btn"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        disabled={busy != null}
      >
        {busy ? <Loader2 aria-hidden="true" size={16} className="spin" /> : <Download aria-hidden="true" size={16} />}
        {busy ? 'Exporting…' : 'Export'}
        <ChevronDown aria-hidden="true" size={14} />
      </button>
      <ul id={listId} ref={listRef} className="export-list" hidden={!open}>
        {ITEMS.map(({ format, label, hint, icon: Icon }) => (
          <li key={format}>
            <button
              type="button"
              onClick={() => {
                close()
                onExport(format)
              }}
            >
              <Icon aria-hidden="true" size={16} />
              <span className="export-label">{label}</span>
              <span className="export-hint">
                {format === 'gdoc' && !googleConfigured ? 'needs setup' : hint}
              </span>
            </button>
          </li>
        ))}
        <li className="export-sep" aria-hidden="true" />
        <li>
          <button
            type="button"
            onClick={() => {
              close(false)
              onGoogleSetup()
            }}
          >
            <Settings aria-hidden="true" size={16} />
            <span className="export-label">Google Docs setup…</span>
          </button>
        </li>
      </ul>
    </div>
  )
}
