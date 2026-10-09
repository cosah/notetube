import type { JSONContent } from '@tiptap/react'
import { createGoogleDoc } from './google'
import { parseYouTubeUrl, videoUrl } from './youtube'

export type ExportFormat = 'txt' | 'md' | 'docx' | 'pdf' | 'gdoc'

export interface ExportSource {
  html: string
  json: JSONContent
  title: string
  videoId: string | null
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export function exportFileBase(title: string): string {
  const date = new Date().toISOString().slice(0, 10)
  const safe = title
    // oxlint-disable-next-line no-control-regex -- strip characters Windows forbids in filenames
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return `${safe || 'Notes'} - notes ${date}`
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// ---------- HTML preparation ----------

type Flavor = 'md' | 'doc' | 'pdf'

/** Header added to exported files so the notes say which video they belong to. */
function headerHtml(src: ExportSource): string {
  if (!src.videoId) return ''
  const url = videoUrl(src.videoId)
  const title = escapeHtml(src.title || 'YouTube video')
  return `<h1>${title}</h1><p>Video: <a href="${url}">${url}</a></p><hr>`
}

/** Rewrites editor-specific markup (task lists, highlights) into something each target understands. */
function prepareHtml(src: ExportSource, flavor: Flavor): string {
  const doc = new DOMParser().parseFromString(`<body>${headerHtml(src)}${src.html}</body>`, 'text/html')

  doc.querySelectorAll<HTMLLIElement>('li[data-type="taskItem"]').forEach((li) => {
    const checked = li.getAttribute('data-checked') === 'true'
    li.querySelector(':scope > label')?.remove()
    const wrapper = li.querySelector(':scope > div')
    if (wrapper) wrapper.replaceWith(...Array.from(wrapper.childNodes))
    const firstP = li.querySelector(':scope > p')

    if (flavor === 'md') {
      // turndown-plugin-gfm turns <li><input type=checkbox> text</li> into "- [x] text".
      if (firstP) firstP.replaceWith(...Array.from(firstP.childNodes))
      const box = doc.createElement('input')
      box.type = 'checkbox'
      if (checked) box.setAttribute('checked', '')
      li.prepend(box)
    } else {
      const mark = flavor === 'pdf' ? (checked ? '[x] ' : '[ ] ') : checked ? '☑ ' : '☐ '
      ;(firstP ?? li).prepend(doc.createTextNode(mark))
    }
  })

  // Normalise timestamp links saved in the older watch?v=…&t= form.
  doc.querySelectorAll<HTMLAnchorElement>('a[data-start]').forEach((a) => {
    const parsed = parseYouTubeUrl(a.getAttribute('href') ?? '')
    if (parsed) a.setAttribute('href', videoUrl(parsed.id, Number(a.dataset.start)))
  })

  if (flavor === 'md') {
    // TipTap wraps list item text in <p>, which turndown renders as "loose" lists with blank lines.
    doc.querySelectorAll('li > p:first-child').forEach((p) => p.replaceWith(...Array.from(p.childNodes)))
  } else {
    doc.querySelectorAll('mark').forEach((m) => {
      const span = doc.createElement('span')
      span.style.backgroundColor = '#fde68a'
      span.append(...Array.from(m.childNodes))
      m.replaceWith(span)
    })
  }

  return doc.body.innerHTML
}

function wrapDocument(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body>${body}</body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

// ---------- Plain text ----------

function inlineText(node: JSONContent): string {
  if (node.type === 'text') {
    const text = node.text ?? ''
    const link = node.marks?.find((m) => m.type === 'link')
    const href = link?.attrs?.href as string | undefined
    // Timestamps already read as "[1:23]"; ordinary links keep their URL in brackets.
    if (href && link?.attrs?.start == null && href !== text) return `${text} (${href})`
    return text
  }
  if (node.type === 'hardBreak') return '\n'
  return (node.content ?? []).map(inlineText).join('')
}

function blockLines(node: JSONContent, depth = 0): string[] {
  const indent = '  '.repeat(depth)
  const children = node.content ?? []
  switch (node.type) {
    case 'doc':
      return children.flatMap((c) => [...blockLines(c, depth), ''])
    case 'paragraph':
      return inlineText(node).split('\n').map((l) => indent + l)
    case 'heading': {
      const text = inlineText(node)
      const level = (node.attrs?.level as number) ?? 1
      return level === 1 ? [text.toUpperCase(), '='.repeat(Math.min(text.length, 60))] : level === 2 ? [text, '-'.repeat(Math.min(text.length, 60))] : [text]
    }
    case 'bulletList':
    case 'orderedList':
    case 'taskList': {
      let n = (node.attrs?.start as number) ?? 1
      return children.flatMap((item) => {
        const marker =
          node.type === 'orderedList' ? `${n++}. ` : node.type === 'taskList' ? (item.attrs?.checked ? '[x] ' : '[ ] ') : '- '
        const [first, ...rest] = item.content ?? []
        const firstLines = first ? blockLines(first, 0) : ['']
        return [
          indent + marker + firstLines[0],
          ...firstLines.slice(1).map((l) => indent + ' '.repeat(marker.length) + l),
          ...rest.flatMap((c) => blockLines(c, depth + 1)),
        ]
      })
    }
    case 'blockquote':
      return children.flatMap((c) => blockLines(c, 0)).map((l) => `${indent}> ${l}`)
    case 'codeBlock':
      return inlineText(node).split('\n').map((l) => `${indent}    ${l}`)
    case 'horizontalRule':
      return [indent + '—'.repeat(20)]
    default:
      return children.length ? children.flatMap((c) => blockLines(c, depth)) : [inlineText(node)]
  }
}

function toPlainText(src: ExportSource): string {
  const header = src.videoId ? [src.title || 'YouTube video', videoUrl(src.videoId), '', ''] : []
  const body = blockLines(src.json)
  return [...header, ...body].join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

// ---------- Format exporters ----------

async function toMarkdown(src: ExportSource): Promise<string> {
  const [{ default: TurndownService }, { gfm }] = await Promise.all([
    import('turndown'),
    import('turndown-plugin-gfm'),
  ])
  const td = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    hr: '---',
    emDelimiter: '*',
  })
  td.use(gfm)
  // Tighter list items than turndown's default ("-   item").
  td.addRule('listItem', {
    filter: 'li',
    replacement: (content, node, options) => {
      const parent = node.parentNode as HTMLElement
      let prefix = `${options.bulletListMarker} `
      if (parent.nodeName === 'OL') {
        const start = Number(parent.getAttribute('start') ?? 1)
        prefix = `${start + Array.prototype.indexOf.call(parent.children, node)}. `
      }
      const body = content
        .replace(/^\n+/, '')
        .replace(/\n+$/, '\n')
        .replace(/\n/gm, `\n${' '.repeat(prefix.length)}`)
      return prefix + body + (node.nextSibling && !/\n$/.test(body) ? '\n' : '')
    },
  })
  td.addRule('highlight', { filter: 'mark', replacement: (content) => `==${content}==` })
  td.addRule('underline', { filter: 'u', replacement: (content) => `<u>${content}</u>` })
  return td.turndown(prepareHtml(src, 'md')) + '\n'
}

async function toDocx(src: ExportSource): Promise<Blob> {
  // The browser build of html-to-docx still references Node's `global`.
  const g = globalThis as { global?: typeof globalThis }
  g.global ??= globalThis
  const { default: HTMLtoDOCX } = await import('@turbodocx/html-to-docx')
  const result = await HTMLtoDOCX(wrapDocument(src.title, prepareHtml(src, 'doc')), null, {
    title: src.title,
    creator: 'NoteTube',
    font: 'Calibri',
  })
  return result instanceof Blob ? result : new Blob([result as BlobPart], { type: DOCX_MIME })
}

interface PdfMakeLike {
  addVirtualFileSystem(vfs: Record<string, string>): void
  createPdf(def: Record<string, unknown>): { download(name: string): Promise<void> }
}

async function downloadPdf(src: ExportSource, filename: string): Promise<void> {
  const [pdfMakeMod, vfsMod, { default: htmlToPdfmake }] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
    import('html-to-pdfmake'),
  ])
  const pdfMake = ((pdfMakeMod as { default?: unknown }).default ?? pdfMakeMod) as PdfMakeLike
  const vfs = ((vfsMod as { default?: unknown }).default ?? vfsMod) as Record<string, string>
  pdfMake.addVirtualFileSystem(vfs)

  const content = htmlToPdfmake(prepareHtml(src, 'pdf'), {
    window,
    defaultStyles: {
      a: { color: '#1a56db', decoration: 'underline' },
      h1: { fontSize: 20, bold: true, marginBottom: 8 },
      h2: { fontSize: 16, bold: true, marginBottom: 6, marginTop: 6 },
      h3: { fontSize: 13, bold: true, marginBottom: 4, marginTop: 4 },
      code: { background: '#eceef2' },
      pre: { background: '#eceef2', margin: [0, 4, 0, 8] },
      blockquote: { italics: true, color: '#4b5361', marginLeft: 12 },
    },
  })

  await pdfMake
    .createPdf({
      info: { title: src.title, creator: 'NoteTube' },
      pageMargins: [56, 56, 56, 56],
      defaultStyle: { fontSize: 11, lineHeight: 1.25 },
      content,
    })
    .download(filename)
}

/** Runs an export. Returns the Google Doc URL for `gdoc`, otherwise nothing (a file is downloaded). */
export async function runExport(format: ExportFormat, src: ExportSource): Promise<string | void> {
  const base = exportFileBase(src.title)
  switch (format) {
    case 'txt':
      return downloadBlob(new Blob([toPlainText(src)], { type: 'text/plain;charset=utf-8' }), `${base}.txt`)
    case 'md':
      return downloadBlob(new Blob([await toMarkdown(src)], { type: 'text/markdown;charset=utf-8' }), `${base}.md`)
    case 'docx':
      return downloadBlob(await toDocx(src), `${base}.docx`)
    case 'pdf':
      return downloadPdf(src, `${base}.pdf`)
    case 'gdoc': {
      return createGoogleDoc(base, wrapDocument(base, prepareHtml(src, 'doc')))
    }
  }
}
