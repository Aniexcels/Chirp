import { beforeEach, describe, expect, it } from 'vitest'
import app from '../index'
import { createEnv, type TestEnv } from './d1'

const headers = (user?: string) => (user ? { 'x-chirp-user': user } : undefined)

const call = (env: TestEnv, path: string, init: RequestInit = {}, user?: string) =>
  app.request(path, {
    ...init,
    headers: { ...headers(user), ...init.headers },
  }, env)

const json = async <T>(response: Response) => (await response.json()) as T

const addUser = async (env: TestEnv, username: string) => {
  await env.DB.prepare('INSERT OR IGNORE INTO users (username, created_at) VALUES (?1, ?2)')
    .bind(username, 1)
    .run()
}

const addPost = async (
  env: TestEnv,
  id: string,
  author: string,
  body: string,
  createdAt: number,
  parentId: string | null = null,
) => {
  await addUser(env, author)
  await env.DB.prepare(
    'INSERT INTO posts (id, author, body, parent_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5)',
  ).bind(id, author, body, parentId, createdAt).run()
}

describe('worker API', () => {
  let env: TestEnv

  beforeEach(() => {
    env = createEnv()
  })

  it('normalizes valid auth handles and treats invalid handles as anonymous', async () => {
    const valid = await call(env, '/api/posts', {}, '  Alice_1  ')
    expect(valid.status).toBe(200)
    await expect(valid.json()).resolves.toEqual([])

    for (const invalid of [undefined, 'ab', 'bad-handle', 'a'.repeat(21), '   ']) {
      const response = await call(
        env,
        '/api/posts',
        { method: 'POST', body: JSON.stringify({ body: 'hello' }) },
        invalid,
      )
      expect(response.status).toBe(401)
      await expect(response.json()).resolves.toEqual({ error: 'pick a username first' })
    }
  })

  it('allows anonymous reads but requires auth for delete and like', async () => {
    await addPost(env, 'p1', 'alice', 'hello', 1)
    expect((await call(env, '/api/posts')).status).toBe(200)
    expect((await call(env, '/api/posts/p1/like', { method: 'POST' })).status).toBe(401)
    expect((await call(env, '/api/posts/p1', { method: 'DELETE' })).status).toBe(401)
  })

  it('lists top-level posts newest first with filters, counts, and personal likes', async () => {
    await addPost(env, 'old', 'alice', 'old', 10)
    await addPost(env, 'new', 'bob', 'new', 20)
    await addPost(env, 'reply', 'alice', 'reply', 30, 'old')
    await env.DB.prepare(
      'INSERT INTO likes (post_id, username, created_at) VALUES (?1, ?2, ?3), (?1, ?4, ?3)',
    ).bind('old', 'alice', 1, 'bob').run()
    await env.DB.prepare(
      'INSERT INTO likes (post_id, username, created_at) VALUES (?1, ?2, ?3)',
    ).bind('new', 'alice', 1).run()

    const response = await call(env, '/api/posts', {}, ' Alice ')
    expect(response.status).toBe(200)
    await expect(json<unknown[]>(response)).resolves.toEqual([
      expect.objectContaining({ id: 'new', likeCount: 1, replyCount: 0, likedByMe: true }),
      expect.objectContaining({ id: 'old', likeCount: 2, replyCount: 1, likedByMe: true }),
    ])

    const filtered = await call(env, '/api/posts?author=alice', {}, 'bob')
    await expect(json<unknown[]>(filtered)).resolves.toHaveLength(1)
    await expect(json<unknown[]>(await call(env, '/api/posts?author=alice', {}, 'carl'))).resolves.toEqual([
      expect.objectContaining({ id: 'old', author: 'alice', likedByMe: false }),
    ])
  })

  it('limits the feed to 50 posts and returns an empty feed for an empty database', async () => {
    const empty = await call(env, '/api/posts')
    await expect(json<unknown[]>(empty)).resolves.toEqual([])
    for (let i = 0; i < 51; i += 1) {
      await addPost(env, `p${i}`, 'alice', `${i}`, i)
    }
    const response = await call(env, '/api/posts')
    const posts = await json<{ id: string }[]>(response)
    expect(posts).toHaveLength(50)
    expect(posts[0].id).toBe('p50')
    expect(posts.at(-1)?.id).toBe('p1')
  })

  it('returns a post thread with replies in ascending creation order and 404s unknown ids', async () => {
    await addPost(env, 'parent', 'alice', 'parent', 10)
    await addPost(env, 'later', 'bob', 'later', 30, 'parent')
    await addPost(env, 'earlier', 'carl', 'earlier', 20, 'parent')
    const response = await call(env, '/api/posts/parent', {}, 'alice')
    const thread = await json<{ post: { id: string }; replies: { id: string }[] }>(response)
    expect(thread.post.id).toBe('parent')
    expect(thread.replies.map((reply) => reply.id)).toEqual(['earlier', 'later'])
    expect((await call(env, '/api/posts/missing')).status).toBe(404)
    await expect((await call(env, '/api/posts/missing')).json()).resolves.toEqual({
      error: 'post not found',
    })
  })

  it('validates posts, trims bodies, supports replies, and upserts authors', async () => {
    const empty = await call(
      env,
      '/api/posts',
      { method: 'POST', body: JSON.stringify({ body: '   ' }) },
      ' Alice ',
    )
    expect(empty.status).toBe(400)
    await expect(empty.json()).resolves.toEqual({ error: 'post cannot be empty' })

    const accepted = await call(
      env,
      '/api/posts',
      { method: 'POST', body: JSON.stringify({ body: ` ${'x'.repeat(280)} ` }) },
      ' Alice ',
    )
    expect(accepted.status).toBe(201)
    const post = await json<{ id: string; body: string; likeCount: number; replyCount: number }>(accepted)
    expect(post).toMatchObject({ author: 'alice', body: 'x'.repeat(280), likeCount: 0, replyCount: 0 })

    const tooLong = await call(
      env,
      '/api/posts',
      { method: 'POST', body: JSON.stringify({ body: 'x'.repeat(281) }) },
      'alice',
    )
    expect(tooLong.status).toBe(400)
    await expect(tooLong.json()).resolves.toEqual({
      error: 'post must be 280 characters or fewer',
    })

    const missingParent = await call(
      env,
      '/api/posts',
      { method: 'POST', body: JSON.stringify({ body: 'reply', parentId: 'missing' }) },
      'alice',
    )
    expect(missingParent.status).toBe(404)
    await expect(missingParent.json()).resolves.toEqual({ error: 'parent post not found' })

    const parent = await call(
      env,
      '/api/posts',
      { method: 'POST', body: JSON.stringify({ body: 'parent' }) },
      'alice',
    )
    const parentPost = await json<{ id: string }>(parent)
    const reply = await call(
      env,
      '/api/posts',
      { method: 'POST', body: JSON.stringify({ body: 'reply', parentId: parentPost.id }) },
      'alice',
    )
    expect(reply.status).toBe(201)
    const feed = await call(env, '/api/posts', {}, 'alice')
    await expect(json<{ id: string; replyCount: number }[]>(feed)).resolves.toEqual([
      expect.objectContaining({ id: parentPost.id, replyCount: 1 }),
      expect.objectContaining({ id: post.id, replyCount: 0 }),
    ])
  })

  it('deletes only the current user’s posts and cascades replies', async () => {
    await addPost(env, 'parent', 'alice', 'parent', 1)
    await addPost(env, 'reply', 'bob', 'reply', 2, 'parent')
    expect((await call(env, '/api/posts/parent', { method: 'DELETE' }, 'bob')).status).toBe(404)
    expect((await call(env, '/api/posts/parent')).status).toBe(200)
    expect((await call(env, '/api/posts/parent', { method: 'DELETE' }, 'alice')).status).toBe(204)
    expect((await call(env, '/api/posts/parent')).status).toBe(404)
    expect((await call(env, '/api/posts/reply')).status).toBe(404)
    expect((await call(env, '/api/posts/missing', { method: 'DELETE' }, 'alice')).status).toBe(404)
  })

  it('toggles likes, accumulates likes from multiple users, and 404s unknown posts', async () => {
    await addPost(env, 'p1', 'alice', 'hello', 1)
    const first = await call(env, '/api/posts/p1/like', { method: 'POST' }, 'alice')
    await expect(first.json()).resolves.toEqual({ likeCount: 1, likedByMe: true })
    const second = await call(env, '/api/posts/p1/like', { method: 'POST' }, 'alice')
    await expect(second.json()).resolves.toEqual({ likeCount: 0, likedByMe: false })
    await expect((await call(env, '/api/posts/p1/like', { method: 'POST' }, 'bob')).json()).resolves.toEqual({
      likeCount: 1,
      likedByMe: true,
    })
    await expect((await call(env, '/api/posts/p1/like', { method: 'POST' }, 'carl')).json()).resolves.toEqual({
      likeCount: 2,
      likedByMe: true,
    })
    expect((await call(env, '/api/posts/nope/like', { method: 'POST' }, 'alice')).status).toBe(404)
  })

  it('returns JSON not-found responses for API paths and delegates assets for other paths', async () => {
    const apiResponse = await call(env, '/api/nope')
    expect(apiResponse.status).toBe(404)
    await expect(apiResponse.json()).resolves.toEqual({ error: 'not found' })
    const request = new Request('https://example.com/index.html')
    const assetResponse = await app.fetch(request, env)
    expect(assetResponse.status).toBe(200)
    expect(await assetResponse.text()).toBe('asset')
    expect(env.ASSETS.fetch).toHaveBeenCalledWith(request)
  })
})
