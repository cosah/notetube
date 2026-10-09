interface Window {
  onYouTubeIframeAPIReady?: () => void
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
