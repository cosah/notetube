// YT.PlayerState values, inlined so they're usable before the API script loads.
const PLAYING = 1
const BUFFERING = 3

/**
 * Thin imperative wrapper around the YouTube player, shared by the video pane,
 * the editor (timestamp clicks) and global keyboard shortcuts.
 */
export class VideoController {
  player: YT.Player | null = null
  private clipTimer: number | undefined
  private typingTimer: number | undefined
  private pausedByTyping = false

  get ready(): boolean {
    return this.player != null && typeof this.player.getCurrentTime === 'function'
  }

  time(): number {
    return this.ready ? this.player!.getCurrentTime() : 0
  }

  duration(): number {
    return this.ready ? this.player!.getDuration() : 0
  }

  isPlaying(): boolean {
    if (!this.ready) return false
    const state = this.player!.getPlayerState()
    return state === PLAYING || state === BUFFERING
  }

  play(): void {
    if (this.ready) this.player!.playVideo()
  }

  pause(): void {
    if (this.ready) this.player!.pauseVideo()
  }

  toggle(): void {
    this.cancelClip()
    this.pausedByTyping = false
    if (this.isPlaying()) this.pause()
    else this.play()
  }

  seek(seconds: number, play = false): void {
    if (!this.ready) return
    this.cancelClip()
    const max = this.duration() || Infinity
    this.player!.seekTo(Math.min(Math.max(0, seconds), max), true)
    if (play) this.play()
  }

  skip(delta: number): void {
    this.seek(this.time() + delta)
  }

  /** Plays from `start` and pauses once playback reaches `end`. */
  playClip(start: number, end: number): void {
    this.seek(start, true)
    this.clipTimer = window.setInterval(() => {
      if (this.time() >= end) {
        this.pause()
        this.cancelClip()
      }
    }, 200)
  }

  cancelClip(): void {
    window.clearInterval(this.clipTimer)
    this.clipTimer = undefined
  }

  /**
   * Called on each typed character when "pause while typing" is on: pauses playback,
   * then resumes once typing has been idle for `resumeAfterMs`.
   */
  noteTyping(resumeAfterMs = 1500): void {
    if (this.isPlaying()) {
      this.pause()
      this.pausedByTyping = true
    }
    if (!this.pausedByTyping) return
    window.clearTimeout(this.typingTimer)
    this.typingTimer = window.setTimeout(() => {
      if (this.pausedByTyping) this.play()
      this.pausedByTyping = false
    }, resumeAfterMs)
  }

  /** Called when the user drives the player directly so typing doesn't override them. */
  clearTypingPause(): void {
    window.clearTimeout(this.typingTimer)
    this.pausedByTyping = false
  }
}
