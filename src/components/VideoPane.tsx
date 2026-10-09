import type { Editor } from '@tiptap/react'
import {
  Clapperboard,
  Clock,
  Link2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Scissors,
  X,
} from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import type { RecentVideo } from '../lib/storage'
import { readJSON, writeJSON } from '../lib/storage'
import type { VideoController } from '../lib/videoController'
import { formatTime, loadYouTubeApi, parseYouTubeUrl, type ParsedVideo } from '../lib/youtube'
import { MomentsList } from './MomentsList'

interface Props {
  controller: VideoController
  editor: Editor | null
  video: ParsedVideo | null
  recent: RecentVideo[]
  clipStart: number | null
  autoPause: boolean
  onAutoPauseChange: (on: boolean) => void
  onLoadVideo: (video: ParsedVideo) => void
  onTitle: (title: string) => void
  onInsertTimestamp: () => void
  onClip: () => void
  onCancelClip: () => void
  onCopyLink: () => void
}

const PLAYER_ERRORS: Record<number, string> = {
  2: 'That doesn’t look like a valid YouTube video ID.',
  5: 'This video can’t be played in an embedded player.',
  100: 'This video was not found. It may be private or removed.',
  101: 'The owner of this video doesn’t allow it to be embedded.',
  150: 'The owner of this video doesn’t allow it to be embedded.',
  153: 'YouTube refused to embed this video from this page.',
}

/** Keeps focus where it was (usually the editor) when a control is clicked with a mouse. */
const keepFocus = (e: MouseEvent) => e.preventDefault()

export function VideoPane(props: Props) {
  const { controller, editor, video, recent, clipStart, autoPause } = props
  const hostRef = useRef<HTMLDivElement>(null)
  const [input, setInput] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [playerError, setPlayerError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [rate, setRate] = useState(1)
  const [rates, setRates] = useState<number[]>([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2])
  const ids = { urlError: useId(), recent: useId(), speed: useId(), autoPause: useId() }

  // Callbacks used inside player events, kept in a ref so the player isn't rebuilt when they change.
  const onTitleRef = useRef(props.onTitle)
  onTitleRef.current = props.onTitle

  const videoId = video?.id ?? null
  const startAt = video?.start

  // Create one player per video.
  useEffect(() => {
    if (!videoId) return
    const host = hostRef.current
    let cancelled = false
    let player: YT.Player | null = null
    setReady(false)
    setPlaying(false)
    setPlayerError(null)
    setTime(0)

    const resumeFrom = startAt ?? readJSON<number>(`pos:${videoId}`, 0)

    loadYouTubeApi()
      .then((YTApi) => {
        if (cancelled || !host) return
        const mount = document.createElement('div')
        host.replaceChildren(mount)
        player = new YTApi.Player(mount, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            playsinline: 1,
            rel: 0,
            start: Math.floor(resumeFrom > 5 ? resumeFrom : 0),
            origin: window.location.origin,
          },
          events: {
            onReady: (e) => {
              if (cancelled) return
              controller.player = e.target
              setReady(true)
              setDuration(e.target.getDuration())
              setRate(e.target.getPlaybackRate())
              const available = e.target.getAvailablePlaybackRates()
              if (available?.length) setRates(available)
              const iframe = e.target.getIframe()
              iframe.title = 'YouTube video player'
              const title = (e.target as unknown as { getVideoData(): { title?: string } }).getVideoData()?.title
              if (title) onTitleRef.current(title)
            },
            onStateChange: (e) => {
              setPlaying(e.data === 1 || e.data === 3)
              if (e.data === 1) {
                setDuration(e.target.getDuration())
                const title = (e.target as unknown as { getVideoData(): { title?: string } }).getVideoData()?.title
                if (title) onTitleRef.current(title)
              }
            },
            onPlaybackRateChange: (e) => setRate(e.data),
            onError: (e) => setPlayerError(PLAYER_ERRORS[e.data] ?? `The video couldn’t be played (error ${e.data}).`),
          },
        })
      })
      .catch((err: Error) => !cancelled && setPlayerError(err.message))

    return () => {
      cancelled = true
      controller.cancelClip()
      if (controller.ready) writeJSON(`pos:${videoId}`, Math.floor(controller.time()))
      if (player && controller.player === player) controller.player = null
      try {
        player?.destroy()
      } catch {
        // player may not have finished initialising
      }
      host?.replaceChildren()
    }
  }, [videoId, startAt, controller])

  // Track the current time (for the timestamp button) and remember the playback position.
  useEffect(() => {
    if (!ready || !videoId) return
    let ticks = 0
    const id = window.setInterval(() => {
      setTime(controller.time())
      if (++ticks % 20 === 0 && controller.isPlaying()) writeJSON(`pos:${videoId}`, Math.floor(controller.time()))
    }, 250)
    return () => window.clearInterval(id)
  }, [ready, videoId, controller])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const parsed = parseYouTubeUrl(input)
    if (!parsed) {
      setInputError('Enter a YouTube link, like https://www.youtube.com/watch?v=… or https://youtu.be/…')
      return
    }
    setInputError(null)
    setInput('')
    props.onLoadVideo(parsed)
  }

  const disabled = !ready
  const recentOthers = recent.filter((r) => r.id !== videoId)

  return (
    <section className="pane video-pane" aria-label="Video">
      <form className="url-bar" onSubmit={submit} noValidate>
        <label htmlFor="video-url" className="sr-only">
          YouTube link
        </label>
        <input
          id="video-url"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste a YouTube link…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-invalid={inputError ? true : undefined}
          aria-describedby={inputError ? ids.urlError : undefined}
        />
        <button type="submit" className="btn btn-primary">
          Load
        </button>
        {recentOthers.length > 0 && (
          <>
            <label htmlFor={ids.recent} className="sr-only">
              Recent videos
            </label>
            <select
              id={ids.recent}
              className="recent-select"
              value=""
              onChange={(e) => e.target.value && props.onLoadVideo({ id: e.target.value })}
            >
              <option value="">Recent…</option>
              {recentOthers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </>
        )}
      </form>
      {inputError && (
        <p id={ids.urlError} className="field-error" role="alert">
          {inputError}
        </p>
      )}

      <div className="video-stage">
        <div className="player-frame">
          <div ref={hostRef} className="player-host" />
          {!videoId && (
            <div className="player-empty">
              <Clapperboard aria-hidden="true" size={40} strokeWidth={1.5} />
              <p className="player-empty-title">Paste a YouTube link above to start</p>
              <p>Notes save automatically, separately for each video. Timestamps you insert jump the video back to that moment.</p>
            </div>
          )}
          {playerError && (
            <div className="player-empty" role="alert">
              <p className="player-empty-title">Can’t play this video</p>
              <p>{playerError}</p>
            </div>
          )}
        </div>
      </div>

      <div className="video-controls">
        <div className="control-row" role="group" aria-label="Playback">
          <button type="button" className="btn btn-icon-text" onMouseDown={keepFocus} onClick={() => controller.skip(-30)} disabled={disabled} aria-label="Back 30 seconds">
            <RotateCcw aria-hidden="true" size={16} />
            <span aria-hidden="true">30</span>
          </button>
          <button type="button" className="btn btn-icon-text" onMouseDown={keepFocus} onClick={() => controller.skip(-10)} disabled={disabled} aria-label="Back 10 seconds" title="Back 10 seconds (Alt+J)">
            <RotateCcw aria-hidden="true" size={16} />
            <span aria-hidden="true">10</span>
          </button>
          <button
            type="button"
            className="btn btn-icon btn-play"
            onMouseDown={keepFocus}
            onClick={() => controller.toggle()}
            disabled={disabled}
            aria-label={playing ? 'Pause' : 'Play'}
            title={`${playing ? 'Pause' : 'Play'} (Alt+K)`}
          >
            {playing ? <Pause aria-hidden="true" size={18} /> : <Play aria-hidden="true" size={18} />}
          </button>
          <button type="button" className="btn btn-icon-text" onMouseDown={keepFocus} onClick={() => controller.skip(10)} disabled={disabled} aria-label="Forward 10 seconds" title="Forward 10 seconds (Alt+L)">
            <span aria-hidden="true">10</span>
            <RotateCw aria-hidden="true" size={16} />
          </button>
          <button type="button" className="btn btn-icon-text" onMouseDown={keepFocus} onClick={() => controller.skip(30)} disabled={disabled} aria-label="Forward 30 seconds">
            <span aria-hidden="true">30</span>
            <RotateCw aria-hidden="true" size={16} />
          </button>

          <span className="time-readout">
            {ready ? `${formatTime(time)} / ${formatTime(duration)}` : '–:–– / –:––'}
          </span>

          <label htmlFor={ids.speed} className="speed-label">
            Speed
          </label>
          <select
            id={ids.speed}
            className="speed-select"
            value={rate}
            disabled={disabled}
            onChange={(e) => controller.player?.setPlaybackRate(Number(e.target.value))}
          >
            {rates.map((r) => (
              <option key={r} value={r}>
                {r === 1 ? 'Normal' : `${r}×`}
              </option>
            ))}
          </select>
        </div>

        <div className="control-row" role="group" aria-label="Link the video into your notes">
          <button
            type="button"
            className="btn"
            onMouseDown={keepFocus}
            onClick={props.onClip}
            disabled={disabled || !editor}
            title={clipStart == null ? 'Mark the start of a clip (Alt+C)' : 'Mark the end and insert the clip (Alt+C)'}
          >
            <Scissors aria-hidden="true" size={16} />
            {clipStart == null ? 'Start clip' : <>End clip <span className="tabular" aria-hidden="true">({formatTime(clipStart)}–{formatTime(time)})</span></>}
          </button>
          {clipStart != null && (
            <button type="button" className="btn btn-icon" onMouseDown={keepFocus} onClick={props.onCancelClip} aria-label="Cancel clip">
              <X aria-hidden="true" size={16} />
            </button>
          )}

          <button type="button" className="btn" onMouseDown={keepFocus} onClick={props.onCopyLink} disabled={disabled} title="Copy a link to this moment in the video">
            <Link2 aria-hidden="true" size={16} />
            Copy link
          </button>

          <label className="switch" htmlFor={ids.autoPause} title="Pause the video while you type and resume when you stop">
            <input
              id={ids.autoPause}
              type="checkbox"
              role="switch"
              checked={autoPause}
              onChange={(e) => props.onAutoPauseChange(e.target.checked)}
            />
            <span className="switch-track" aria-hidden="true" />
            Pause while typing
          </label>

          {/* Last in the row and pushed right, so it sits against the split, closest to the notes. */}
          <button
            type="button"
            className="btn btn-primary insert-ts"
            onMouseDown={keepFocus}
            onClick={props.onInsertTimestamp}
            disabled={disabled || !editor}
            title="Insert a timestamp at your cursor (Alt+T)"
            aria-label="Insert timestamp"
          >
            <Clock aria-hidden="true" size={16} />
            Insert timestamp <span className="tabular" aria-hidden="true">{ready ? formatTime(time) : ''}</span>
          </button>
        </div>
      </div>

      <MomentsList editor={editor} controller={controller} currentTime={time} ready={ready} />
    </section>
  )
}
