import { useEffect, useState } from 'react'
import { MIN_PASSWORD_LENGTH } from '../../shared/types'
import * as api from '../api'
import chirpMark from '../assets/chirp-mark.png'

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'something went wrong'

/** Handles the two links transactional email sends: reset and verification. */
export default function TokenScreen({
  kind,
  token,
  onDone,
}: {
  kind: 'reset-password' | 'verify-email'
  token: string
  onDone: () => void
}) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (kind !== 'verify-email') return
    let cancelled = false
    const verify = async () => {
      if (!token) {
        setError('this link is missing its token')
        return
      }
      setBusy(true)
      try {
        await api.verifyEmail(token)
        if (!cancelled) setDone(true)
      } catch (e) {
        if (!cancelled) setError(messageOf(e))
      } finally {
        if (!cancelled) setBusy(false)
      }
    }
    void verify()
    return () => {
      cancelled = true
    }
  }, [kind, token])

  const submit = async () => {
    if (busy || password.length < MIN_PASSWORD_LENGTH) return
    setBusy(true)
    setError('')
    try {
      await api.confirmPasswordReset(token, password)
      setDone(true)
    } catch (e) {
      setError(messageOf(e))
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
      <h1>{kind === 'reset-password' ? 'Choose a new password' : 'Email confirmation'}</h1>

      {kind === 'reset-password' && !done && (
        <>
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            value={password}
            autoComplete="new-password"
            autoFocus
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="hint">
            At least {MIN_PASSWORD_LENGTH} characters. Every existing session is signed out.
          </p>
          <button
            className="primary"
            type="submit"
            disabled={busy || password.length < MIN_PASSWORD_LENGTH}
          >
            Update password
          </button>
        </>
      )}

      {busy && kind === 'verify-email' && <p className="notice">Confirming…</p>}
      {done && (
        <p className="notice">
          {kind === 'reset-password'
            ? 'Password updated — sign in with your new password.'
            : 'Email confirmed.'}
        </p>
      )}
      {error && <p className="error">{error}</p>}

      <button type="button" className="link-button auth-switch" onClick={onDone}>
        Continue to Chirp
      </button>
    </form>
  )
}
