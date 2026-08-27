import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Composer from './Composer'

describe('Composer', () => {
  const renderComposer = (onSubmit = vi.fn().mockResolvedValue(true)) =>
    render(<Composer placeholder="Write" submitLabel="Send" onSubmit={onSubmit} />)

  it('shows remaining characters, marks over-limit text, and disables invalid submissions', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(true)
    renderComposer(onSubmit)
    const input = screen.getByPlaceholderText('Write')
    const button = screen.getByRole('button', { name: 'Send' })
    expect(screen.getByText('280')).toBeInTheDocument()
    expect(button).toBeDisabled()
    await user.type(input, '   ')
    expect(button).toBeDisabled()
    await user.clear(input)
    await user.type(input, 'a'.repeat(281))
    expect(screen.getByText('-1')).toHaveClass('over')
    expect(button).toBeDisabled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it.each(['Control', 'Meta'])('%s+Enter submits trimmed text and clears on success', async (modifier) => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(true)
    renderComposer(onSubmit)
    const input = screen.getByPlaceholderText('Write')
    await user.type(input, '  hello  ')
    await user.keyboard(`{${modifier}>}{Enter}{/${modifier}}`)
    expect(onSubmit).toHaveBeenCalledWith('hello')
    expect(input).toHaveValue('')
  })

  it('keeps a rejected draft and disables the button while submitting', async () => {
    const user = userEvent.setup()
    let resolve: (accepted: boolean) => void = () => undefined
    const onSubmit = vi.fn(() => new Promise<boolean>((r) => { resolve = r }))
    renderComposer(onSubmit)
    const input = screen.getByPlaceholderText('Write')
    await user.type(input, 'draft')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    resolve(false)
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled())
    expect(input).toHaveValue('draft')
  })
})
