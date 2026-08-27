import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPost, deletePost, getThread, listPosts, toggleLike } from './api'

describe('api client', () => {
  afterEach(() => vi.restoreAllMocks())

  it('sends the expected URL, headers, and JSON body', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ id: 'p1' }), { status: 201 }),
    )
    await createPost('alice', 'hello')
    expect(fetchMock).toHaveBeenCalledWith('/api/posts', {
      method: 'POST',
      body: JSON.stringify({ body: 'hello', parentId: null }),
      headers: { 'content-type': 'application/json', 'x-chirp-user': 'alice' },
    })

    await createPost('alice', 'reply', 'parent')
    expect(fetchMock).toHaveBeenLastCalledWith('/api/posts', expect.objectContaining({
      body: JSON.stringify({ body: 'reply', parentId: 'parent' }),
    }))
    await getThread('alice', 'p1')
    expect(fetchMock).toHaveBeenLastCalledWith('/api/posts/p1', expect.objectContaining({
      headers: { 'content-type': 'application/json', 'x-chirp-user': 'alice' },
    }))
    await toggleLike('alice', 'p1')
    expect(fetchMock).toHaveBeenLastCalledWith('/api/posts/p1/like', expect.objectContaining({ method: 'POST' }))
    await deletePost('alice', 'p1')
    expect(fetchMock).toHaveBeenLastCalledWith('/api/posts/p1', expect.objectContaining({ method: 'DELETE' }))
  })

  it('encodes author filters and handles 204 responses without parsing JSON', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('[]'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    await listPosts('alice', 'name with/slash')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/posts?author=name%20with%2Fslash',
      expect.objectContaining({ headers: { 'content-type': 'application/json', 'x-chirp-user': 'alice' } }),
    )
    await expect(deletePost('alice', 'p1')).resolves.toBeUndefined()
  })

  it('rejects with server errors and a fallback when no error field is returned', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'nope' }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'ignored' }), { status: 500 }))
    await expect(listPosts('alice')).rejects.toThrow('nope')
    await expect(listPosts('alice')).rejects.toThrow('request failed')
  })
})
