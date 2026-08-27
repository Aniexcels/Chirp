import { beforeEach, describe, expect, it } from 'vitest'
import type { ApiError, LikeResult, Post, Thread } from '../shared/types'
import { createClient, json, post, resetDatabase, signUp } from './helpers'

beforeEach(() => resetDatabase())

const publish = async (
  client: ReturnType<typeof createClient>,
  body: string,
  parentId?: string,
) => {
  const res = await post(client, '/api/posts', { body, parentId: parentId ?? null })
  expect(res.status).toBe(201)
  return json<Post>(res)
}

describe('writing posts', () => {
  it('requires a session for every write', async () => {
    const author = await signUp('ada')
    const created = await publish(author, 'hello world')
    const anonymous = createClient()

    expect((await post(anonymous, '/api/posts', { body: 'sneaky' })).status).toBe(401)
    expect((await anonymous.fetch(`/api/posts/${created.id}`, { method: 'DELETE' })).status).toBe(401)
    expect((await post(anonymous, `/api/posts/${created.id}/like`)).status).toBe(401)
    // Reads stay public.
    expect((await anonymous.fetch('/api/posts')).status).toBe(200)
  })

  it('ignores a client-supplied identity header', async () => {
    const author = await signUp('ada')
    await signUp('grace')

    const created = await json<Post>(
      await author.fetch('/api/posts', {
        method: 'POST',
        body: JSON.stringify({ body: 'whose post is this' }),
        headers: { 'x-chirp-user': 'grace' },
      }),
    )
    expect(created.author).toBe('ada')
  })

  it.each([
    ['an empty body', { body: '   ' }],
    ['an over-long body', { body: 'x'.repeat(281) }],
    ['a non-string body', { body: 42 }],
    ['an object parentId', { body: 'hi', parentId: { id: 'x' } }],
    ['a missing body', {}],
  ])('rejects %s with a structured 400', async (_label, payload) => {
    const client = await signUp('ada')
    const res = await post(client, '/api/posts', payload)
    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect((await json<ApiError>(res)).code).toBe('validation_error')
  })

  it('rejects a reply to a post that does not exist', async () => {
    const client = await signUp('ada')
    const res = await post(client, '/api/posts', { body: 'reply', parentId: 'nope' })
    expect(res.status).toBe(404)
  })

  it('rate limits bursts of posting', async () => {
    const client = await signUp('ada')
    let status = 201
    for (let i = 0; i < 40 && status === 201; i += 1) {
      status = (await post(client, '/api/posts', { body: `post ${i}` })).status
    }
    expect(status).toBe(429)
  })
})

describe('deleting posts', () => {
  it('only lets the author delete, and hides existence from others', async () => {
    const author = await signUp('ada')
    const other = await signUp('grace')
    const created = await publish(author, 'mine')

    const forbidden = await other.fetch(`/api/posts/${created.id}`, { method: 'DELETE' })
    expect(forbidden.status).toBe(404)
    expect((await author.fetch(`/api/posts/${created.id}`)).status).toBe(200)

    expect((await author.fetch(`/api/posts/${created.id}`, { method: 'DELETE' })).status).toBe(204)
    expect((await author.fetch(`/api/posts/${created.id}`)).status).toBe(404)
  })

  it('removes replies and likes with the post', async () => {
    const author = await signUp('ada')
    const root = await publish(author, 'root')
    const reply = await publish(author, 'reply', root.id)
    await post(author, `/api/posts/${root.id}/like`)

    expect((await author.fetch(`/api/posts/${root.id}`, { method: 'DELETE' })).status).toBe(204)
    expect((await author.fetch(`/api/posts/${reply.id}`)).status).toBe(404)
  })
})

describe('threads', () => {
  it('keeps replies out of the root feed and counts them', async () => {
    const client = await signUp('ada')
    const root = await publish(client, 'root')
    await publish(client, 'reply', root.id)

    const feed = await json<Post[]>(await client.fetch('/api/posts'))
    expect(feed).toHaveLength(1)
    expect(feed[0]).toMatchObject({ id: root.id, replyCount: 1 })

    const thread = await json<Thread>(await client.fetch(`/api/posts/${root.id}`))
    expect(thread.replies).toHaveLength(1)
    expect(thread.replies[0].parentId).toBe(root.id)
  })

  it('makes a nested reply reachable through its own thread', async () => {
    const client = await signUp('ada')
    const root = await publish(client, 'root')
    const reply = await publish(client, 'reply', root.id)
    const nested = await publish(client, 'nested reply', reply.id)

    // The root thread shows one level only...
    const rootThread = await json<Thread>(await client.fetch(`/api/posts/${root.id}`))
    expect(rootThread.replies.map((r) => r.id)).toEqual([reply.id])
    expect(rootThread.replies[0].replyCount).toBe(1)

    // ...and the nested reply is reachable by opening that reply's thread.
    const replyThread = await json<Thread>(await client.fetch(`/api/posts/${reply.id}`))
    expect(replyThread.replies.map((r) => r.id)).toEqual([nested.id])
    expect(replyThread.post.parentId).toBe(root.id)
  })

  it('answers 404 for an unknown post', async () => {
    const res = await createClient().fetch('/api/posts/does-not-exist')
    expect(res.status).toBe(404)
    expect((await json<ApiError>(res)).code).toBe('not_found')
  })
})

describe('likes', () => {
  it('toggles and reports per-viewer state', async () => {
    const author = await signUp('ada')
    const other = await signUp('grace')
    const created = await publish(author, 'like me')

    const liked = await json<LikeResult>(await post(author, `/api/posts/${created.id}/like`))
    expect(liked).toEqual({ likeCount: 1, likedByMe: true })

    const seenByOther = await json<Post[]>(await other.fetch('/api/posts'))
    expect(seenByOther[0]).toMatchObject({ likeCount: 1, likedByMe: false })

    const unliked = await json<LikeResult>(await post(author, `/api/posts/${created.id}/like`))
    expect(unliked).toEqual({ likeCount: 0, likedByMe: false })
  })

  it('never double-counts concurrent taps', async () => {
    const author = await signUp('ada')
    const created = await publish(author, 'like me')

    await Promise.all(
      Array.from({ length: 6 }, () => post(author, `/api/posts/${created.id}/like`)),
    )

    const feed = await json<Post[]>(await author.fetch('/api/posts'))
    // Whatever order the toggles land in, the stored state stays coherent:
    // a like either exists once or not at all.
    expect(feed[0].likeCount).toBeLessThanOrEqual(1)
    expect(feed[0].likedByMe).toBe(feed[0].likeCount === 1)
  })

  it('answers 404 when liking a post that does not exist', async () => {
    const client = await signUp('ada')
    expect((await post(client, '/api/posts/nope/like')).status).toBe(404)
  })
})

describe('author filter', () => {
  it('matches regardless of case and rejects a malformed handle', async () => {
    const author = await signUp('ada')
    await publish(author, 'mine')
    const other = await signUp('grace')
    await publish(other, 'theirs')

    expect(await json<Post[]>(await author.fetch('/api/posts?author=ADA'))).toHaveLength(1)
    expect(await json<Post[]>(await author.fetch('/api/posts?author=ada'))).toHaveLength(1)
    expect(await json<Post[]>(await author.fetch('/api/posts?author=nobody'))).toHaveLength(0)
    // A blank filter is a bad request, not "the whole feed".
    expect((await author.fetch('/api/posts?author=%20')).status).toBe(400)
    expect((await author.fetch('/api/posts?author=not+a+handle')).status).toBe(400)
  })
})
