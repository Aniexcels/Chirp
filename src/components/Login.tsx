import { useState } from 'react'
import { USERNAME_PATTERN } from '../../shared/types'
import chirpMark from '../assets/chirp-mark.png'

export default function Login({ onSignIn }: { onSignIn: (username: string) => void }) {
  const [value, setValue] = useState('')
  const username = value.trim().toLowerCase()
  const valid = USERNAME_PATTERN.test(username)

  return (
    <form
      className="login"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) onSignIn(username)
      }}
    >
      <img className="login-mark" src={chirpMark} alt="Chirp" width={96} height={96} />
      <h1>Chirp</h1>
      <p className="tagline">Share more. Connect better.</p>
      <p>Pick a handle to start posting. 3–20 characters: a–z, 0–9, underscore.</p>
      <input
        type="text"
        value={value}
        placeholder="handle"
        autoFocus
        onChange={(e) => setValue(e.target.value)}
      />
      <button className="primary" type="submit" disabled={!valid}>
        Enter
      </button>
    </form>
  )
}
