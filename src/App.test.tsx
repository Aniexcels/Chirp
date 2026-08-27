import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Post } from '../shared/types'

const api = vi.hoisted(() => ({
  listPosts: vi.fn(),
  getThread: vi.fn(),
  createPost: vi.fn(),
  deletePost: vi.fn(),
  toggleLike: vi.fn(),
}))

vi.mock('./api', () => api)

import App from './App'

const makePost = (overrides: Partial<Post> = {}): Post => ({
  id: 'p1',
  author: 'alice',
  body: 'Hello',
  createdAt: Date.now(),
  likeCount: 1,
  replyCount: 0,
  likedByMe: false,
  parentId: null,
  ...overrides,
})

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    api.listPosts.mockResolvedValue([])
    api.getThread.mockResolvedValue({ post: makePost(), replies: [] })
    api.createPost.mockResolvedValue(makePost())
    api.deletePost.mockResolvedValue(undefined)
    api.toggleLike.mockResolvedValue({ likeCount: 2, likedByMe: true })
  })

  it('shows login, persists a normalized sign-in, and signs out', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByPlaceholderText('handle'), ' Alice ')
    await user.click(screen.getByRole('button', { name: 'Enter' }))
    expect(localStorage.getItem('chirp:user')).toBe('alice')
    expect(await screen.findByText(/alice/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'sign out' }))
    expect(localStorage.getItem('chirp:user')).toBeNull()
    expect(screen.getByPlaceholderText('handle')).toBeInTheDocument()
  })

  it('renders feed errors and reloads after publishing', async () => {
    localStorage.setItem('chirp:user', 'alice')
    api.listPosts.mockRejectedValueOnce(new Error('feed broken')).mockResolvedValue([])
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByText('feed broken')).toHaveClass('error')
    await user.type(screen.getByPlaceholderText('What\'s happening?'), 'new chirp')
    const composer = screen.getByPlaceholderText('What\'s happening?').closest('form') as HTMLFormElement
    await user.click(within(composer).getByRole('button', { name: 'Chirp' }))
    expect(api.createPost).toHaveBeenCalledWith('alice', 'new chirp', undefined)
    await vi.waitFor(() => expect(api.listPosts).toHaveBeenCalledTimes(2))
  })

  it('opens threads, returns to the feed, filters by author, and updates likes in place', async () => {
    localStorage.setItem('chirp:user', 'alice')
    const post = makePost({ author: 'bob' })
    api.listPosts.mockResolvedValue([post])
    api.getThread.mockResolvedValue({ post, replies: [] })
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByText('Hello'))
    expect(await screen.findByText('← back to feed')).toBeInTheDocument()
    await user.click(screen.getByText('← back to feed'))
    await user.click(screen.getByRole('button', { name: '@bob' }))
    expect(await screen.findByText(/Posts by @/)).toBeInTheDocument()
    expect(api.listPosts).toHaveBeenLastCalledWith('alice', 'bob')
    await user.click(screen.getByRole('button', { name: 'Like' }))
    expect(await screen.findByRole('button', { name: 'Unlike' })).toHaveTextContent('2')
  })

  it('returns from a deleted thread and keeps a failed composer draft', async () => {
    localStorage.setItem('chirp:user', 'alice')
    const post = makePost({ author: 'alice' })
    api.listPosts.mockResolvedValue([post])
    api.getThread.mockResolvedValue({ post, replies: [] })
    api.createPost.mockRejectedValue(new Error('publish failed'))
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByText('Hello'))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByPlaceholderText('What\'s happening?')).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText('What\'s happening?'), 'keep me')
    const composer = screen.getByPlaceholderText('What\'s happening?').closest('form') as HTMLFormElement
    await user.click(within(composer).getByRole('button', { name: 'Chirp' }))
    expect(await screen.findByText('publish failed')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('What\'s happening?')).toHaveValue('keep me')
  })
})
