// Google Docs export, fully client-side. The app's OAuth Client ID comes from
// VITE_GOOGLE_CLIENT_ID (client IDs aren't secret); if that isn't set, users can supply
// their own in the setup dialog. Google Identity Services issues a short-lived access
// token, kept in sessionStorage for this tab only, and the Drive API converts uploaded
// HTML into a Google Doc.

import { readString, writeString } from './storage'

const BUILT_IN_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim()

/** True when the deployment ships its own Client ID, so users only need to sign in. */
export const hasBuiltInClientId = BUILT_IN_CLIENT_ID !== ''

const TOKEN_KEY = 'notetube:google-token'

const GIS_SRC = 'https://accounts.google.com/gsi/client'
const SCOPE = 'https://www.googleapis.com/auth/drive.file'

interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void
}

interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string
    scope: string
    callback: (resp: TokenResponse) => void
    error_callback?: (err: { type: string; message?: string }) => void
  }): TokenClient
  revoke(token: string, done?: () => void): void
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } }
  }
}

type Token = { value: string; expiresAt: number }

let gisPromise: Promise<GoogleOAuth2> | null = null
let token: Token | null = loadToken()

function loadToken(): Token | null {
  try {
    const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null') as Token | null
    return t && t.expiresAt > Date.now() ? t : null
  } catch {
    return null
  }
}

function saveToken(t: Token | null): void {
  token = t
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, JSON.stringify(t))
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // ignore: the token just won't survive a reload
  }
}

export function getClientId(): string {
  return BUILT_IN_CLIENT_ID || readString('google-client-id') || ''
}

export function setClientId(id: string): void {
  writeString('google-client-id', id.trim() || null)
  saveToken(null)
}

export function isSignedIn(): boolean {
  return token != null && token.expiresAt > Date.now()
}

export function signOut(): void {
  if (token) window.google?.accounts?.oauth2?.revoke(token.value)
  saveToken(null)
}

/** Loads Google Identity Services. Call early so the sign-in popup can open within the click. */
export function preloadGoogle(): Promise<GoogleOAuth2> {
  if (gisPromise) return gisPromise
  gisPromise = new Promise((resolve, reject) => {
    const done = () => {
      const oauth2 = window.google?.accounts?.oauth2
      if (oauth2) resolve(oauth2)
      else reject(new Error('Google sign-in failed to initialise.'))
    }
    if (window.google?.accounts?.oauth2) return done()
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.onload = done
    script.onerror = () => {
      gisPromise = null
      reject(new Error('Could not load Google sign-in. Check your connection or content blocker.'))
    }
    document.head.appendChild(script)
  })
  return gisPromise
}

async function getAccessToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value
  const clientId = getClientId()
  if (!clientId) throw new Error('Add your Google OAuth Client ID first (Export → Google Docs setup).')
  const oauth2 = await preloadGoogle()

  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error_description || resp.error || 'Google sign-in was not completed.'))
          return
        }
        saveToken({
          value: resp.access_token,
          expiresAt: Date.now() + (resp.expires_in ?? 3600) * 1000,
        })
        resolve(resp.access_token)
      },
      error_callback: (err) => {
        const message =
          err.type === 'popup_closed'
            ? 'Google sign-in was closed before finishing.'
            : err.type === 'popup_failed_to_open'
              ? 'The Google sign-in popup was blocked. Allow popups for this site and try again.'
              : err.message || 'Google sign-in failed.'
        reject(new Error(message))
      },
    })
    client.requestAccessToken({ prompt: '' })
  })
}

/** Uploads HTML to Drive as a native Google Doc and returns its URL. */
export async function createGoogleDoc(title: string, html: string): Promise<string> {
  const accessToken = await getAccessToken()
  const boundary = `notetube-${crypto.randomUUID()}`
  const metadata = { name: title, mimeType: 'application/vnd.google-apps.document' }
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${html}\r\n` +
    `--${boundary}--`

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  )

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) saveToken(null)
    let detail = ''
    try {
      detail = (await res.json())?.error?.message ?? ''
    } catch {
      // ignore
    }
    if (res.status === 403 && /has not been used|disabled/i.test(detail)) {
      throw new Error('The Google Drive API is not enabled for your Cloud project. Enable it and try again.')
    }
    if (res.status === 403 && /insufficient/i.test(detail)) {
      throw new Error('Google Drive access wasn’t granted. Try again and tick the box allowing NoteTube to create files.')
    }
    throw new Error(`Google Drive rejected the upload (${res.status}). ${detail}`.trim())
  }
  const file = (await res.json()) as { id: string; webViewLink?: string }
  return file.webViewLink ?? `https://docs.google.com/document/d/${file.id}/edit`
}
