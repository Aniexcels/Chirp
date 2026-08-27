import { useState } from 'react'
import { USERNAME_PATTERN } from '../../shared/types'

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
      <h1>Chirp</h1>
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
