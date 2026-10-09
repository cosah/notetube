import { useEffect, useId, useState, type FormEvent } from 'react'
import { getClientId, isSignedIn, preloadGoogle, setClientId, signOut } from '../lib/google'
import { Dialog } from './Dialog'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: (configured: boolean) => void
}

export function GoogleSetupDialog({ open, onClose, onSaved }: Props) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()
  const errorId = useId()
  const origin = window.location.origin

  useEffect(() => {
    if (open) {
      setValue(getClientId())
      setError(null)
    }
  }, [open])

  const save = (e: FormEvent) => {
    e.preventDefault()
    const id = value.trim()
    if (id && !/\.apps\.googleusercontent\.com$/.test(id)) {
      setError('That doesn’t look like an OAuth Client ID. It should end in “.apps.googleusercontent.com”.')
      return
    }
    setClientId(id)
    if (id) preloadGoogle().catch(() => {})
    onSaved(Boolean(id))
    onClose()
  }

  return (
    <Dialog
      open={open}
      title="Google Docs setup"
      onClose={onClose}
      footer={
        <>
          {isSignedIn() && (
            <button type="button" className="btn" onClick={() => { signOut(); onClose() }}>
              Sign out of Google
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="google-setup-form" className="btn btn-primary">
            Save
          </button>
        </>
      }
    >
      <p>
        NoteTube has no server, so Google Docs export uses <strong>your own</strong> Google OAuth Client ID. It is stored
        only in this browser. The sign-in token is kept only for this browser tab and expires after an hour. NoteTube can only see files it
        creates (the <code>drive.file</code> scope).
      </p>
      <details className="setup-steps">
        <summary>How to get a Client ID (about 5 minutes)</summary>
        <ol>
          <li>
            Open the{' '}
            <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">
              Google Cloud console
            </a>{' '}
            and create a project (any name).
          </li>
          <li>
            Enable the{' '}
            <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noreferrer">
              Google Drive API
            </a>{' '}
            for that project.
          </li>
          <li>
            Set up the{' '}
            <a href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noreferrer">
              OAuth consent screen
            </a>
            : choose <em>External</em>, fill in the app name and your email, then add your Google account under{' '}
            <em>Audience → Test users</em>.
          </li>
          <li>
            Go to{' '}
            <a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noreferrer">
              Clients
            </a>{' '}
            → <em>Create client</em> → <em>Web application</em>. Under <em>Authorized JavaScript origins</em> add:
            <code className="origin">{origin}</code>
          </li>
          <li>Copy the Client ID and paste it below.</li>
        </ol>
      </details>
      <form id="google-setup-form" onSubmit={save} noValidate>
        <label htmlFor={inputId} className="field-label">
          OAuth Client ID
        </label>
        <input
          id={inputId}
          type="text"
          className="text-input"
          spellCheck={false}
          autoComplete="off"
          placeholder="1234567890-abc123.apps.googleusercontent.com"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        {error && (
          <p id={errorId} className="field-error" role="alert">
            {error}
          </p>
        )}
        <p className="field-hint">Leave the field empty and save to remove it.</p>
      </form>
    </Dialog>
  )
}
