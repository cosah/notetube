interface Window {
  onYouTubeIframeAPIReady?: () => void
}

interface ImportMetaEnv {
  /** OAuth Client ID for Google Docs export. Optional: without it users supply their own. */
  readonly VITE_GOOGLE_CLIENT_ID?: string
}

declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown'
  export const gfm: TurndownService.Plugin
  export const tables: TurndownService.Plugin
  export const strikethrough: TurndownService.Plugin
  export const taskListItems: TurndownService.Plugin
}

declare module 'html-to-pdfmake' {
  export default function htmlToPdfmake(
    html: string,
    options?: { window?: Window; defaultStyles?: Record<string, Record<string, unknown>> },
  ): unknown
}
