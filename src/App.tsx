import { EditorState } from '@tiptap/pm/state'
import { useEditor, type Editor, type JSONContent } from '@tiptap/react'
import { FilePlus2, Keyboard, Library, Monitor, Moon, Share, Sun, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Group, Panel, Separator, useGroupRef, type Layout } from 'react-resizable-panels'
import { ExportMenu } from './components/ExportMenu'
import { GitHubIcon } from './components/GitHubIcon'
import { GoogleSetupDialog } from './components/GoogleSetupDialog'
import { ImportDialog, type ImportMode } from './components/ImportDialog'
import { NotesBrowser } from './components/NotesBrowser'
import { NotesPane, type SaveState } from './components/NotesPane'
import { ShortcutsDialog } from './components/ShortcutsDialog'
import { VideoPane } from './components/VideoPane'
import { extensions } from './editor/extensions'
import { insertTimestamp } from './editor/timestamps'
import { useMediaQuery } from './hooks/useMediaQuery'
import { useTheme } from './hooks/useTheme'
import type { ExportFormat } from './lib/exporters'
import { getClientId, preloadGoogle } from './lib/google'
import {
  docText,
  listSavedNotes,
  notesKey,
  notesTitle,
  readJSON,
  readString,
  recordNotesSaved,
  recordNotesTitle,
  removeNotes,
  removeNotesIndexEntry,
  writeJSON,
  writeString,
} from './lib/storage'
import { VideoController } from './lib/videoController'
import { createShareLink, isShareHash, LONG_LINK_CHARS, readShareHash, type SharedNote } from './lib/share'
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
  const [title, setTitle] = useState(() => (video ? notesTitle(video.id) : ''))
  const [clipStart, setClipStart] = useState<number | null>(null)
  const [autoPause, setAutoPause] = useState(() => readJSON('auto-pause', false))
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' })
  const [busy, setBusy] = useState<ExportFormat | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [googleOpen, setGoogleOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [googleConfigured, setGoogleConfigured] = useState(() => Boolean(getClientId()))
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
          // Enter doesn't count: starting a new line shouldn't pause the video.
          if (event.key.length === 1 || event.key === 'Backspace') controller.noteTyping()
        }
        return false
      },
    },
  })

  // Load the current video's notes, and autosave them (debounced) as they change.
  const prevVideoRef = useRef<string | null | undefined>(undefined)
  const titleRef = useRef(title)
  titleRef.current = title
  useEffect(() => {
    if (!editor) return
    const key = notesKey(videoId)
    const prev = prevVideoRef.current
    prevVideoRef.current = videoId
    const saved = readJSON<JSONContent | null>(key, null)

    if (prev === null && videoId && !saved && !editor.isEmpty) {
      // Notes typed before any video was loaded move over to the first video.
      writeJSON(key, editor.getJSON())
      removeNotes(null)
      recordNotesSaved(videoId, titleRef.current)
    } else {
      loadDocument(editor, saved)
    }
    setSaveState({ status: 'idle' })

    let timer: number | undefined
    const save = () => {
      timer = undefined
      // An emptied editor removes its entry rather than keeping a blank one around.
      if (editor.isEmpty) {
        writeString(key, null)
        removeNotesIndexEntry(videoId)
        setSaveState({ status: 'saved', at: Date.now() })
        return
      }
      const ok = writeJSON(key, editor.getJSON())
      setSaveState(ok ? { status: 'saved', at: Date.now() } : { status: 'error' })
      if (!ok) return
      recordNotesSaved(videoId, titleRef.current)
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
    setTitle(notesTitle(v.id))
  }, [])

  const onTitle = useCallback(
    (t: string) => {
      setTitle(t)
      if (videoId) recordNotesTitle(videoId, t)
    },
    [videoId],
  )

  // ----- New / Notes browser -----

  /** Unloads the video and blanks the editor. Video notes stay saved; only scratchpad text is discarded. */
  const startFresh = () => {
    if (!editor) return
    const scratchText = videoId ? docText(readJSON(notesKey(null), null)) : editor.getText().trim()
    if (
      scratchText &&
      !window.confirm('Clear the scratchpad? These notes aren’t attached to a video, so they can’t be recovered.')
    ) {
      return
    }
    removeNotes(null)
    setClipStart(null)
    if (videoId) {
      // Switching to no video flushes this video's notes, then loads the (now empty) scratchpad.
      setVideo(null)
      setTitle('')
      showToast({ tone: 'info', message: 'Started fresh. Your notes for that video are saved under Notes.' })
    } else {
      loadDocument(editor, null)
    }
    requestAnimationFrame(() => document.getElementById('video-url')?.focus())
  }

  const openNotes = (id: string | null) => {
    if (id === videoId) return
    if (id) loadVideo({ id })
    else {
      setVideo(null)
      setTitle('')
      setClipStart(null)
    }
  }

  const deleteNotes = (id: string | null) => {
    removeNotes(id)
    // Deleting the notes that are open also clears the editor.
    if (editor && id === videoId) loadDocument(editor, null)
  }

  const deleteAllNotes = () => {
    for (const n of listSavedNotes()) removeNotes(n.videoId)
    if (editor) loadDocument(editor, null)
  }

  // ----- Share links -----

  /** The saved (or, for the open notes, live) document for a video or the scratchpad. */
  const notesDoc = (id: string | null): JSONContent | null =>
    id === videoId && editor ? editor.getJSON() : readJSON<JSONContent | null>(notesKey(id), null)

  const shareNotes = (id: string | null) => {
    const doc = notesDoc(id)
    if (!doc || !docText(doc)) {
      showToast({ tone: 'error', message: 'There’s nothing to share yet. Write some notes first.' })
      return
    }
    const linkPromise = createShareLink({ videoId: id, title: id === videoId ? title : notesTitle(id ?? ''), doc })
    const done = (link: string) => {
      const long = link.length > LONG_LINK_CHARS
      showToast({
        tone: 'info',
        message: long
          ? `Share link copied. It’s long (${link.length.toLocaleString()} characters), so some apps may cut it off. If it won’t open, export the notes instead.`
          : 'Share link copied. Anyone with the link can read these notes.',
      })
    }
    const fallback = async () => {
      const link = await linkPromise
      try {
        await navigator.clipboard.writeText(link)
        done(link)
      } catch {
        window.prompt('Copy this share link:', link)
      }
    }
    // Hand the clipboard a promise while still inside the click, so browsers that require
    // a user gesture (Safari) accept the copy even though compression is async.
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      const blob = linkPromise.then((l) => new Blob([l], { type: 'text/plain' }))
      navigator.clipboard
        .write([new ClipboardItem({ 'text/plain': blob })])
        .then(() => linkPromise.then(done))
        .catch(fallback)
    } else {
      fallback()
    }
  }

  // Opening the app from a share link (or pasting one into the address bar).
  const [incoming, setIncoming] = useState<SharedNote | null>(null)
  useEffect(() => {
    const check = () => {
      const { hash } = window.location
      if (!isShareHash(hash)) return
      // Drop the fragment so a reload doesn't ask again.
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
      readShareHash(hash)
        .then(setIncoming)
        .catch((err: Error) => showToast({ tone: 'error', message: err.message }))
    }
    check()
    window.addEventListener('hashchange', check)
    return () => window.removeEventListener('hashchange', check)
  }, [showToast])

  const incomingHasExisting = incoming ? Boolean(docText(notesDoc(incoming.videoId))) : false

  const importShared = (mode: ImportMode) => {
    if (!incoming) return
    const { videoId: id, title: sharedTitle, doc: shared } = incoming
    const mine = notesDoc(id)
    const doc: JSONContent =
      mode === 'append' && mine && docText(mine)
        ? { type: 'doc', content: [...(mine.content ?? []), { type: 'horizontalRule' }, ...(shared.content ?? [])] }
        : shared
    writeJSON(notesKey(id), doc)
    recordNotesSaved(id, sharedTitle)
    setIncoming(null)

    if (id === videoId) {
      // Already open: swap the editor contents directly.
      if (editor) loadDocument(editor, doc)
    } else if (id) {
      loadVideo({ id })
    } else {
      setVideo(null)
      setTitle('')
      setClipStart(null)
    }
    showToast({
      tone: 'info',
      message: mode === 'append' ? 'Shared notes added below yours.' : 'Shared notes opened. A copy is saved in this browser.',
    })
  }

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
          <nav className="legal-links" aria-label="Legal">
            <a href="/privacy.html">Privacy</a>
            <a href="/terms.html">Terms</a>
            <a href="https://github.com/cosah/notetube" className="github-link" aria-label="NoteTube on GitHub" title="NoteTube on GitHub">
              <GitHubIcon size={18} />
            </a>
          </nav>
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
                <>
                  <button
                    type="button"
                    className="btn"
                    onClick={startFresh}
                    aria-label="New"
                    title="Start fresh: clear the video and notes (saved video notes stay under Notes)"
                  >
                    <FilePlus2 aria-hidden="true" size={16} />
                    <span className="hide-narrow">New</span>
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setNotesOpen(true)}
                    aria-label="Notes"
                    aria-haspopup="dialog"
                    title="Browse, open or delete your saved notes"
                  >
                    <Library aria-hidden="true" size={16} />
                    <span className="hide-narrow">Notes</span>
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => shareNotes(videoId)}
                    aria-label="Share"
                    title="Copy a link that shares these notes"
                  >
                    <Share aria-hidden="true" size={16} />
                    <span className="hide-narrow">Share</span>
                  </button>
                  <ExportMenu
                    busy={busy}
                    googleConfigured={googleConfigured}
                    onExport={doExport}
                    onGoogleSetup={() => setGoogleOpen(true)}
                  />
                </>
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
      <NotesBrowser
        open={notesOpen}
        currentVideoId={videoId}
        onClose={() => setNotesOpen(false)}
        onOpenNotes={openNotes}
        onDeleteNotes={deleteNotes}
        onDeleteAll={deleteAllNotes}
        onShareNotes={shareNotes}
      />
      <ImportDialog
        note={incoming}
        hasExisting={incomingHasExisting}
        onCancel={() => setIncoming(null)}
        onImport={importShared}
      />
    </div>
  )
}
