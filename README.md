# NoteTube

Watch a YouTube video on the left and take timestamped notes on the right. Everything runs in the browser. There is no backend, and notes are saved in `localStorage`, one set per video.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

## Features

- **Resizable split.** Drag the divider, or focus it and use the arrow keys. Each side can be at most 3× the other (25%–75%). The position is remembered separately for desktop and mobile layouts.
- **Rich-text editor** (TipTap): headings, bold/italic/underline/strike, highlight, inline code, links, bulleted/numbered/check lists, quotes, code blocks, dividers, alignment, undo/redo, word count.
- **Timestamps.** "Insert timestamp" (or `Alt+T`) inserts a `[1:23]` link where your cursor was, then puts focus and the cursor back just after it. Click a timestamp to jump the video there. `Ctrl/⌘+Enter` does the same from the keyboard.
- **Clips.** "Start clip" then "End clip" (or `Alt+C` twice) inserts a `[1:02–1:45]` range. Clicking it plays that range and then pauses.
- **Timestamp index.** Under the video, every timestamp in your notes is listed in time order, and the one you're currently watching is highlighted.
- **Playback controls.** ±10s and ±30s buttons, play/pause, speed. Shortcuts that work while typing: `Alt+K`, `Alt+J`, `Alt+L`.
- **Pause while typing.** Optional: the video pauses as you type and resumes once you stop.
- **Copy link.** Copies a youtu.be link to the current moment.
- **Autosave and resume.** Notes save as you type. Videos resume from where you left off. The `?v=` URL can be bookmarked, and a "Recent" menu brings back earlier videos.
- **Export** to `.txt`, `.md`, `.docx`, `.pdf` or Google Docs. Exports include the video title and link, and timestamps stay clickable links to the right moment.
- **Light, dark or system theme**, built to WCAG 2.2 AA: contrast ≥ 4.5:1 for text and ≥ 3:1 for controls, visible focus, keyboard-operable throughout, 24px minimum targets, reduced-motion support.

## Google Docs export

Each user brings their own Google OAuth Client ID. It is stored only in their browser, and the access token stays in memory. The app asks for the `drive.file` scope only, so it can see only the files it creates. Open **Export → Google Docs setup…** for step-by-step instructions. In short:

1. Create a Google Cloud project and enable the **Google Drive API**.
2. Configure the OAuth consent screen (External) and add yourself as a test user.
3. Create an OAuth client of type **Web application**, with this site's origin (e.g. `http://localhost:5173`) as an authorized JavaScript origin.
4. Paste the Client ID into the setup dialog.

## Stack

Vite + React + TypeScript · TipTap · react-resizable-panels · YouTube IFrame Player API · turndown (Markdown) · @turbodocx/html-to-docx (Word) · pdfmake + html-to-pdfmake (PDF) · Google Identity Services + Drive API (Docs) · lucide-react icons.

The export libraries are code-split and load only on first export.
