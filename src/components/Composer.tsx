import { useState } from 'react'
import { MAX_POST_LENGTH } from '../../shared/types'

interface Props {
  placeholder: string
  submitLabel: string
  /** Resolves to true when the post was accepted; the input is only cleared then. */
  onSubmit: (body: string) => Promise<boolean>
}

export default function Composer({ placeholder, submitLabel, onSubmit }: Props) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  const remaining = MAX_POST_LENGTH - body.length
  const canSubmit = body.trim().length > 0 && remaining >= 0 && !busy

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    try {
      if (await onSubmit(body.trim())) setBody('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <textarea
        rows={3}
        value={body}
        placeholder={placeholder}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            void submit()
          }
        }}
      />
      <div className="composer-row">
        <span className={`counter${remaining < 0 ? ' over' : ''}`}>{remaining}</span>
        <button className="primary" type="submit" disabled={!canSubmit}>
          {submitLabel}
        </button>
      </div>
    </form>
  )
}
