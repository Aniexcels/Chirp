import { useState } from 'react'
import type { AuthenticatedUser } from '../../shared/types'
import { MIN_PASSWORD_LENGTH, USERNAME_PATTERN } from '../../shared/types'
import * as api from '../api'
import { RequestError } from '../api'
import chirpMark from '../assets/chirp-mark.png'

type Mode = 'login' | 'register' | 'forgot'

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'something went wrong'

export default function AuthScreen({ onSignedIn }: { onSignedIn: (user: AuthenticatedUser) => void }) {
  const [mode, setMode] = useState<Mode>('login')
  const [handle, setHandle] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const username = handle.trim().toLowerCase()
  const handleValid = USERNAME_PATTERN.test(username)
  const canSubmit =
    !busy &&
    handleValid &&
    (mode === 'forgot' || password.length >= (mode === 'register' ? MIN_PASSWORD_LENGTH : 1))

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (mode === 'forgot') {
        await api.requestPasswordReset(username)
        setNotice('If that handle has a verified email, a reset link is on its way.')
      } else if (mode === 'register') {
        const session = await api.register({
          username,
          password,
          email: email.trim() || undefined,
          displayName: displayName.trim() || undefined,
        })
        onSignedIn(session.user)
      } else {
        const session = await api.login({ username, password })
        onSignedIn(session.user)
      }
    } catch (e) {
      setError(
        e instanceof RequestError && e.code === 'rate_limited'
          ? 'too many attempts — wait a moment and try again'
          : messageOf(e),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="login"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <img className="login-mark" src={chirpMark} alt="Chirp" width={96} height={96} />
      <h1>Chirp</h1>
      <p className="tagline">Share more. Connect better.</p>

      <div className="auth-tabs" role="tablist">
        {(['login', 'register'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={mode === tab}
            className={`auth-tab${mode === tab ? ' active' : ''}`}
            onClick={() => {
              setMode(tab)
              setError('')
              setNotice('')
            }}
          >
            {tab === 'login' ? 'Sign in' : 'Create account'}
          </button>
        ))}
      </div>

      <label htmlFor="handle">Handle</label>
      <input
        id="handle"
        type="text"
        value={handle}
        placeholder="handle"
        autoComplete="username"
        autoFocus
        onChange={(e) => setHandle(e.target.value)}
      />
      {handle && !handleValid && (
        <p className="hint">3–20 characters: a–z, 0–9, underscore.</p>
      )}

      {mode !== 'forgot' && (
        <>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === 'register' && (
            <p className="hint">At least {MIN_PASSWORD_LENGTH} characters.</p>
          )}
        </>
      )}

      {mode === 'register' && (
        <>
          <label htmlFor="displayName">Display name (optional)</label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            autoComplete="name"
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <label htmlFor="email">Email (optional, needed for password resets)</label>
          <input
            id="email"
            type="email"
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
          />
        </>
      )}

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      <button className="primary" type="submit" disabled={!canSubmit}>
        {mode === 'forgot' ? 'Send reset link' : mode === 'register' ? 'Create account' : 'Sign in'}
      </button>

      <button
        type="button"
        className="link-button auth-switch"
        onClick={() => {
          setMode(mode === 'forgot' ? 'login' : 'forgot')
          setError('')
          setNotice('')
        }}
      >
        {mode === 'forgot' ? 'Back to sign in' : 'Forgot your password?'}
      </button>
    </form>
  )
}
