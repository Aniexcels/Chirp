import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Login from './Login'

describe('Login', () => {
  it('enables Enter only for valid handles and submits normalized input', async () => {
    const user = userEvent.setup()
    const onSignIn = vi.fn()
    render(<Login onSignIn={onSignIn} />)
    const input = screen.getByPlaceholderText('handle')
    const button = screen.getByRole('button', { name: 'Enter' })
    expect(button).toBeDisabled()
    await user.type(input, '  Alice_1  ')
    expect(button).toBeEnabled()
    await user.click(button)
    expect(onSignIn).toHaveBeenCalledWith('alice_1')
  })

  it('does not submit invalid handles', async () => {
    const user = userEvent.setup()
    const onSignIn = vi.fn()
    render(<Login onSignIn={onSignIn} />)
    await user.type(screen.getByPlaceholderText('handle'), 'no')
    await user.keyboard('{Enter}')
    expect(onSignIn).not.toHaveBeenCalled()
  })
})
