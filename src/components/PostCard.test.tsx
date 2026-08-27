import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Post } from '../../shared/types'
import PostCard from './PostCard'

const post: Post = {
  id: 'p1',
  author: 'alice',
  body: 'Hello world',
  createdAt: Date.now(),
  likeCount: 3,
  replyCount: 2,
  likedByMe: true,
  parentId: null,
}

describe('PostCard', () => {
  const renderCard = (overrides: Partial<React.ComponentProps<typeof PostCard>> = {}) => {
    const props = {
      post,
      currentUser: 'alice',
      onLike: vi.fn(),
      onDelete: vi.fn(),
      ...overrides,
    }
    return { ...render(<PostCard {...props} />), props }
  }

  it('renders content, relative time, counts, like state, and owner delete action', () => {
    renderCard()
    expect(screen.getByText('@alice')).toBeInTheDocument()
    expect(screen.getByText('Hello world')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unlike' })).toHaveTextContent('3')
    expect(screen.getByText('💬 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unlike' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('opens only when a card is clickable and action clicks do not bubble', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    const onAuthorClick = vi.fn()
    const { props } = renderCard({ onOpen, onAuthorClick })
    const card = document.querySelector('article') as HTMLElement
    expect(card).toHaveClass('clickable')
    await user.click(screen.getByText('Hello world'))
    expect(onOpen).toHaveBeenCalledWith(post)
    await user.click(screen.getByRole('button', { name: '@alice' }))
    await user.click(screen.getByRole('button', { name: 'Unlike' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onAuthorClick).toHaveBeenCalledWith('alice')
    expect(props.onLike).toHaveBeenCalledWith(post)
    expect(props.onDelete).toHaveBeenCalledWith(post)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('hides delete for another author and allows non-clickable cards', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    renderCard({ currentUser: 'bob', onOpen: undefined })
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    await user.click(screen.getByText('Hello world'))
    expect(onOpen).not.toHaveBeenCalled()
    expect(document.querySelector('article')).not.toHaveClass('clickable')
  })
})
