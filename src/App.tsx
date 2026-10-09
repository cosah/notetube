import { EditorState } from '@tiptap/pm/state'
import { useEditor, type Editor, type JSONContent } from '@tiptap/react'
import { Keyboard, Monitor, Moon, Sun, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Group, Panel, Separator, useGroupRef, type Layout } from 'react-resizable-panels'
import { ExportMenu } from './components/ExportMenu'
import { GoogleSetupDialog } from './components/GoogleSetupDialog'
import { NotesPane, type SaveState } from './components/NotesPane'
import { ShortcutsDialog } from './components/ShortcutsDialog'
import { VideoPane } from './components/VideoPane'
import { extensions } from './editor/extensions'
import { insertTimestamp } from './editor/timestamps'
import { useMediaQuery } from './hooks/useMediaQuery'
import { useTheme } from './hooks/useTheme'
import type { ExportFormat } from './lib/exporters'
import { preloadGoogle } from './lib/google'
import {
  getRecentVideos,
  notesKey,
  readJSON,
  readString,
  touchRecentVideo,
  writeJSON,
  writeString,
  type RecentVideo,
} from './lib/storage'
import { VideoController } from './lib/videoController'
import { formatTime, parseYouTubeUrl, videoUrl, type ParsedVideo } from './lib/youtube'

interface Toast {
  id: number
  message: string
  tone: 'info' | 'error'
  href?: string
  linkText?: string
}

const FORMAT_NAMES: Record<ExportFormat, string> = {
  txt: 'plain text',
  md: 'Markdown',
  docx: 'Word',
  pdf: 'PDF',
  gdoc: 'Google Docs',
}

const DEFAULT_LAYOUT = {
  horizontal: { video: 50, notes: 50 },
  vertical: { video: 42, notes: 58 },
}

function initialVideo(): ParsedVideo | null {
  const fromUrl = new URLSearchParams(window.location.search).get('v')
  if (fromUrl) {
    const parsed = parseYouTubeUrl(fromUrl)
    const t = new URLSearchParams(window.location.search).get('t')
    if (parsed) return t ? { ...parsed, start: Number(t) || undefined } : parsed
  }
  const last = readString('last-video')
  return last ? { id: last } : null
}

/** Replaces the document and resets undo history, so undo can't bring back another video's notes. */
function loadDocument(editor: Editor, content: JSONContent | null) {
  editor.commands.setContent(content ?? '', { emitUpdate: false })
  const { schema, doc, plugins } = editor.state
  editor.view.updateState(EditorState.create({ schema, doc, plugins }))
  editor.view.dispatch(editor.state.tr.setMeta('notetube:loaded', true).setMeta('addToHistory', false))
}

export default function App() {
  const [controller] = useState(() => new VideoController())
  const [video, setVideo] = useState<ParsedVideo | null>(initialVideo)
  const [recent, setRecent] = useState<RecentVideo[]>(getRecentVideos)
  const [title, setTitle] = useState(() => getRecentVideos().find((r) => r.id === video?.id)?.title ?? '')
  const [clipStart, setClipStart] = useState<number | null>(null)
  const [autoPause, setAutoPause] = useState(() => readJSON('auto-pause', false))
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' })
  const [busy, setBusy] = useState<ExportFormat | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [googleOpen, setGoogleOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [googleConfigured, setGoogleConfigured] = useState(() => Boolean(readString('google-client-id')))
  const { theme, cycle: cycleTheme } = useTheme()

  const videoId = video?.id ?? null
  const displayTitle = videoId ? title || 'Untitled video' : 'Scratchpad (no video loaded)'

  const showToast = useCallback((t: Omit<Toast, 'id'>) => setToast({ ...t, id: Date.now() }), [])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), toast.href ? 20_000 : 5_000)
    return () => window.clearTimeout(id)
  }, [toast])

  // ----- Editor -----

  const autoPauseRef = useRef(autoPause)
  autoPauseRef.current = autoPause

  const editor = useEditor({
    extensions,
    editorProps: {
      attributes: {
        class: 'prose',
        id: 'notes-editor',
        'aria-label': 'Notes',
        'aria-multiline': 'true',
        role: 'textbox',
        spellcheck: 'true',
      },
      handleClick: (_view, _pos, event) => {
        const a = (event.target as HTMLElement).closest('a')
        if (!a) return false
        const start = a.getAttribute('data-start')
        if (start != null) {
          event.preventDefault()
          controller.clearTypingPause()
          const end = a.getAttribute('data-end')
          if (end != null) controller.playClip(Number(start), Number(end))
          else controller.seek(Number(start), true)
          return true
        }
        if (event.ctrlKey || event.metaKey) {
          window.open(a.href, '_blank', 'noopener,noreferrer')
          return true
        }
        return false
      },
      handleKeyDown: (view, event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          const { $from } = view.state.selection
          for (const node of [$from.nodeAfter, $from.nodeBefore]) {
            const link = node?.marks.find((m) => m.type.name === 'link' && m.attrs.start != null)
            if (link) {
              const { start, end } = link.attrs as { start: number; end: number | null }
              if (end != null) controller.playClip(start, end)
              else controller.seek(start, true)
              return true
            }
          }
          return false
        }
        if (autoPauseRef.current && !event.ctrlKey && !event.metaKey && !event.altKey) {
          if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Enter') controller.noteTyping()
        }
        return false
      },
    },
  })

  // Load the current video's notes, and autosave them (debounced) as they change.
  const prevVideoRef = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (!editor) return
    const key = notesKey(videoId)
    const prev = prevVideoRef.current
    prevVideoRef.current = videoId
    const saved = readJSON<JSONContent | null>(key, null)

    if (prev === null && videoId && !saved && !editor.isEmpty) {
      // Notes typed before any video was loaded move over to the first video.
      writeJSON(key, editor.getJSON())
      writeString(notesKey(null), null)
    } else {
      loadDocument(editor, saved)
    }
    setSaveState({ status: 'idle' })

    let timer: number | undefined
    const save = () => {
      timer = undefined
      const ok = writeJSON(key, editor.getJSON())
      setSaveState(ok ? { status: 'saved', at: Date.now() } : { status: 'error' })
      if (ok && videoId) setRecent(touchRecentVideo(videoId))
    }
    const onUpdate = () => {
      setSaveState({ status: 'pending' })
      window.clearTimeout(timer)
      timer = window.setTimeout(save, 600)
    }
    const flush = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer)
        save()
      }
    }
    const onVisibility = () => document.visibilityState === 'hidden' && flush()

    editor.on('update', onUpdate)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      flush()
      editor.off('update', onUpdate)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [editor, videoId])

  // ----- Video -----

  useEffect(() => {
    writeString('last-video', videoId)
    const url = new URL(window.location.href)
    if (videoId) url.searchParams.set('v', videoId)
    else url.searchParams.delete('v')
    url.searchParams.delete('t')
    window.history.replaceState(null, '', url)
    document.title = videoId && title ? `${title} · NoteTube` : 'NoteTube'
  }, [videoId, title])

  const loadVideo = useCallback((v: ParsedVideo) => {
    setVideo(v)
    setClipStart(null)
    const list = touchRecentVideo(v.id)
    setRecent(list)
    setTitle(list.find((r) => r.id === v.id)?.title ?? '')
  }, [])

  const onTitle = useCallback(
    (t: string) => {
      setTitle(t)
      if (videoId) setRecent(touchRecentVideo(videoId, t))
    },
    [videoId],
  )

  const insertTs = () => {
    if (!editor || !videoId || !controller.ready) return
    insertTimestamp(editor, videoId, controller.time())
  }

  const clip = () => {
    if (!editor || !videoId || !controller.ready) return
    const now = controller.time()
    if (clipStart == null) {
      setClipStart(now)
      showToast({ tone: 'info', message: `Clip started at ${formatTime(now)}. Press “End clip” when it’s done.` })
      return
    }
    let [s, e] = [clipStart, now]
    if (e < s) [s, e] = [e, s]
    if (e - s < 1) {
      showToast({ tone: 'error', message: 'That clip is under a second long. Let the video play, then end the clip.' })
      return
    }
    insertTimestamp(editor, videoId, s, e)
    setClipStart(null)
  }

  const copyLink = async () => {
    if (!videoId) return
    const t = controller.time()
    try {
      await navigator.clipboard.writeText(videoUrl(videoId, t))
      showToast({ tone: 'info', message: `Link to ${formatTime(t)} copied.` })
    } catch {
      showToast({ tone: 'error', message: 'Couldn’t copy to the clipboard.' })
    }
  }

  // Global shortcuts. Alt+letter doesn't type anything in the editor, so they work while writing.
  const actionsRef = useRef({ insertTs, clip })
  actionsRef.current = { insertTs, clip }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      const actions: Record<string, () => void> = {
        KeyK: () => controller.toggle(),
        KeyJ: () => controller.skip(-10),
        KeyL: () => controller.skip(10),
        KeyT: () => actionsRef.current.insertTs(),
        KeyC: () => actionsRef.current.clip(),
      }
      const action = actions[e.code]
      if (!action) return
      e.preventDefault()
      e.stopPropagation()
      controller.clearTypingPause()
      action()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [controller])

  useEffect(() => {
    if (googleConfigured) preloadGoogle().catch(() => {})
  }, [googleConfigured])

  // ----- Export -----

  const doExport = async (format: ExportFormat) => {
    if (!editor) return
    if (format === 'gdoc' && !googleConfigured) {
      setGoogleOpen(true)
      return
    }
    setBusy(format)
    try {
      const { runExport } = await import('./lib/exporters')
      const result = await runExport(format, {
        html: editor.getHTML(),
        json: editor.getJSON(),
        title: videoId ? title || 'YouTube video' : 'Notes',
        videoId,
      })
      if (format === 'gdoc' && result) {
        window.open(result, '_blank', 'noopener,noreferrer')
        showToast({ tone: 'info', message: 'Google Doc created.', href: result, linkText: 'Open in Google Docs' })
      } else {
        showToast({ tone: 'info', message: `Exported as ${FORMAT_NAMES[format]}.` })
      }
    } catch (err) {
      showToast({ tone: 'error', message: `Export failed: ${(err as Error).message}` })
    } finally {
      setBusy(null)
    }
  }

  // ----- Layout -----

  const narrow = useMediaQuery('(max-width: 760px)')
  const orientation = narrow ? 'vertical' : 'horizontal'
  const groupRef = useGroupRef()
  const savedLayout = useMemo(
    () => readJSON<Layout>(`layout:${orientation}`, DEFAULT_LAYOUT[orientation]),
    [orientation],
  )
  const firstLayout = useRef(true)
  useEffect(() => {
    if (firstLayout.current) {
      firstLayout.current = false
      return
    }
    groupRef.current?.setLayout(savedLayout)
  }, [savedLayout, groupRef])

  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor

  return (
    <div className="app">
      <a href="#notes-editor" className="skip-link">
        Skip to notes
      </a>
      <header className="app-header">
        <div className="brand">
          <svg aria-hidden="true" viewBox="0 0 32 32" width="24" height="24">
            <rect width="32" height="32" rx="7" fill="var(--accent)" />
            <path d="M8 9h9v14H8z" fill="var(--on-accent)" />
            <path d="M11 13.2v5.6l4.4-2.8z" fill="var(--accent)" />
            <path d="M19.5 11h5M19.5 15h5M19.5 19h3.5" stroke="var(--on-accent)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <h1>NoteTube</h1>
        </div>
        <div className="header-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setShortcutsOpen(true)} aria-label="Keyboard shortcuts">
            <Keyboard aria-hidden="true" size={17} />
            <span className="hide-narrow">Shortcuts</span>
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={cycleTheme}
            aria-label={`Theme: ${theme}. Change theme`}
            title="Change theme (system, light, dark)"
          >
            <ThemeIcon aria-hidden="true" size={17} />
            <span className="hide-narrow" aria-hidden="true">
              {theme === 'system' ? 'System' : theme === 'light' ? 'Light' : 'Dark'}
            </span>
          </button>
        </div>
      </header>

      <main className="split-wrap">
        <Group
          className="split"
          orientation={orientation}
          groupRef={groupRef}
          defaultLayout={savedLayout}
          onLayoutChanged={(layout) => writeJSON(`layout:${orientation}`, layout)}
        >
          <Panel id="video" minSize="25" maxSize="75" className="panel">
            <VideoPane
              controller={controller}
              editor={editor}
              video={video}
              recent={recent}
              clipStart={clipStart}
              autoPause={autoPause}
              onAutoPauseChange={(on) => {
                setAutoPause(on)
                writeJSON('auto-pause', on)
              }}
              onLoadVideo={loadVideo}
              onTitle={onTitle}
              onInsertTimestamp={insertTs}
              onClip={clip}
              onCancelClip={() => setClipStart(null)}
              onCopyLink={copyLink}
            />
          </Panel>
          <Separator className="split-handle" aria-label="Resize video and notes">
            <span className="split-grip" aria-hidden="true" />
          </Separator>
          <Panel id="notes" minSize="25" maxSize="75" className="panel">
            <NotesPane
              editor={editor}
              saveState={saveState}
              title={displayTitle}
              exportControl={
                <ExportMenu
                  busy={busy}
                  googleConfigured={googleConfigured}
                  onExport={doExport}
                  onGoogleSetup={() => setGoogleOpen(true)}
                />
              }
            />
          </Panel>
        </Group>
      </main>

      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`toast ${toast.tone === 'error' ? 'toast-error' : ''}`}>
            <span>{toast.message}</span>
            {toast.href && (
              <a href={toast.href} target="_blank" rel="noopener noreferrer">
                {toast.linkText ?? 'Open'}
              </a>
            )}
            <button type="button" className="btn btn-icon btn-ghost" onClick={() => setToast(null)} aria-label="Dismiss">
              <X aria-hidden="true" size={16} />
            </button>
          </div>
        )}
      </div>

      <GoogleSetupDialog open={googleOpen} onClose={() => setGoogleOpen(false)} onSaved={setGoogleConfigured} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  )
}
