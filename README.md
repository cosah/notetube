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
- **New and Notes.** "New" clears the video and the editor. "Notes" lists every saved set of notes so you can reopen or delete them.
- **Share links.** "Share" copies a link that carries the whole note, compressed into the part of the URL after `#`, which never reaches a server. Opening the link previews the note and saves a copy, either added below your existing notes or replacing them.
- **Copy link.** Copies a youtu.be link to the current moment.
- **Autosave and resume.** Notes save as you type. Videos resume from where you left off. The `?v=` URL can be bookmarked.
- **Export** to `.txt`, `.md`, `.docx`, `.pdf` or Google Docs. Exports include the video title and link, and timestamps stay clickable links to the right moment.
- **Light, dark or system theme**, built to WCAG 2.2 AA: contrast ≥ 4.5:1 for text and ≥ 3:1 for controls, visible focus, keyboard-operable throughout, 24px minimum targets, reduced-motion support.

## Google Docs export

Users choose **Export → Google Docs**, sign in with Google in a popup, and the doc opens in Drive. Everything runs in the browser: Google Identity Services issues a one-hour access token, which is kept only for that browser tab. The app asks for the `drive.file` scope only, so it can see only the files it creates.

The deployment provides one OAuth Client ID through `VITE_GOOGLE_CLIENT_ID`. Client IDs are public identifiers, not secrets. To create one:

1. Create a Google Cloud project and enable the **Google Drive API**.
2. Configure the OAuth consent screen (External). While the app is in **Testing**, only the test users you list can sign in. Publish it to let anyone sign in.
3. Create an OAuth client of type **Web application**. Add every origin the app runs on under *Authorized JavaScript origins*, e.g. `http://localhost:5173` and `https://notetube-teal.vercel.app`.
4. Set the ID locally in `.env.local` (see `.env.example`), and on Vercel with `vercel env add VITE_GOOGLE_CLIENT_ID`. Then redeploy.

If `VITE_GOOGLE_CLIENT_ID` isn't set, the app falls back to **Export → Google Docs setup…**, where each user pastes their own Client ID.

## Stack

Vite + React + TypeScript · TipTap · react-resizable-panels · YouTube IFrame Player API · turndown (Markdown) · @turbodocx/html-to-docx (Word) · pdfmake + html-to-pdfmake (PDF) · Google Identity Services + Drive API (Docs) · lucide-react icons.

The export libraries are code-split and load only on first export.
