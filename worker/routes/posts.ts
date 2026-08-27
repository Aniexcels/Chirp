import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { notFound } from '../errors'
import { LIMITS, enforceRateLimit } from '../rateLimit'
import { requireUser } from '../session'
import { normalizeUsername, parseCreatePostBody } from '../validate'
import type { LikeResult, Post, Thread } from '../../shared/types'

const FEED_LIMIT = 50
const REPLY_LIMIT = 100

interface PostRow {
  id: string
  author_id: string
  author: string
  author_display_name: string
  body: string
  parent_id: string | null
  created_at: number
  like_count: number
  reply_count: number
  liked_by_me: number
}

const toPost = (row: PostRow): Post => ({
  id: row.id,
  authorId: row.author_id,
  author: row.author,
  authorDisplayName: row.author_display_name,
  body: row.body,
  parentId: row.parent_id,
  createdAt: row.created_at,
  likeCount: row.like_count,
  replyCount: row.reply_count,
  likedByMe: row.liked_by_me === 1,
})

/** `?1` is always the viewer id (empty string when anonymous). */
const POST_SELECT = `
  SELECT p.id, p.author_id, u.username AS author, u.display_name AS author_display_name,
         p.body, p.parent_id, p.created_at,
         (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count,
         (SELECT COUNT(*) FROM posts r WHERE r.parent_id = p.id) AS reply_count,
         EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = ?1) AS liked_by_me
  FROM posts p JOIN users u ON u.id = p.author_id
`

const posts = new Hono<AppEnv>()

posts.get('/', async (c) => {
  const viewerId = c.get('user')?.id ?? ''
  // An author filter must be a valid handle; a blank one is rejected rather
  // than silently treated as "the whole feed".
  const authorParam = c.req.query('author')
  const author = authorParam === undefined ? null : normalizeUsername(authorParam, 'author')

  const where = author ? 'WHERE p.parent_id IS NULL AND u.username = ?2' : 'WHERE p.parent_id IS NULL'
  const statement = c.env.DB.prepare(
    `${POST_SELECT} ${where} ORDER BY p.created_at DESC LIMIT ${FEED_LIMIT}`,
  )
  const { results } = await (author
    ? statement.bind(viewerId, author)
    : statement.bind(viewerId)
  ).all<PostRow>()
  return c.json(results.map(toPost))
})

posts.get('/:id', async (c) => {
  const viewerId = c.get('user')?.id ?? ''
  const id = c.req.param('id')
  const post = await c.env.DB.prepare(`${POST_SELECT} WHERE p.id = ?2`)
    .bind(viewerId, id)
    .first<PostRow>()
  if (!post) throw notFound('post not found')

  // Only direct replies: a thread is paged one level at a time rather than
  // loading an unbounded reply tree, and each reply links to its own thread.
  const { results } = await c.env.DB.prepare(
    `${POST_SELECT} WHERE p.parent_id = ?2 ORDER BY p.created_at ASC LIMIT ${REPLY_LIMIT}`,
  )
    .bind(viewerId, id)
    .all<PostRow>()
  const thread: Thread = { post: toPost(post), replies: results.map(toPost) }
  return c.json(thread)
})

posts.post('/', async (c) => {
  const user = requireUser(c)
  await enforceRateLimit(c.env, `post:${user.id}`, LIMITS.createPost)
  const { body, parentId } = parseCreatePostBody(await c.req.json())

  if (parentId) {
    const parent = await c.env.DB.prepare('SELECT id FROM posts WHERE id = ?1')
      .bind(parentId)
      .first()
    if (!parent) throw notFound('parent post not found')
  }

  const id = crypto.randomUUID()
  const createdAt = Date.now()
  await c.env.DB.prepare(
    `INSERT INTO posts (id, author_id, body, parent_id, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?5)`,
  )
    .bind(id, user.id, body, parentId, createdAt)
    .run()

  const post: Post = {
    id,
    authorId: user.id,
    author: user.username,
    authorDisplayName: user.displayName,
    body,
    parentId,
    createdAt,
    likeCount: 0,
    replyCount: 0,
    likedByMe: false,
  }
  return c.json(post, 201)
})

posts.delete('/:id', async (c) => {
  const user = requireUser(c)
  const id = c.req.param('id')
  // Ownership is enforced in the statement itself, so a forged id cannot
  // delete someone else's post.
  const result = await c.env.DB.prepare('DELETE FROM posts WHERE id = ?1 AND author_id = ?2')
    .bind(id, user.id)
    .run()
  // Someone else's post reports "not found" rather than "forbidden", so ids
  // cannot be probed for existence.
  if (!result.meta.changes) throw notFound('post not found')
  return c.body(null, 204)
})

posts.post('/:id/like', async (c) => {
  const user = requireUser(c)
  const id = c.req.param('id')
  await enforceRateLimit(c.env, `like:${user.id}`, LIMITS.like)

  const post = await c.env.DB.prepare('SELECT id FROM posts WHERE id = ?1').bind(id).first()
  if (!post) throw notFound('post not found')

  // The insert decides the direction of the toggle, so concurrent taps cannot
  // both read "not liked" and lose an update.
  const inserted = await c.env.DB.prepare(
    `INSERT INTO likes (post_id, user_id, created_at) VALUES (?1, ?2, ?3)
     ON CONFLICT (post_id, user_id) DO NOTHING
     RETURNING 1 AS liked`,
  )
    .bind(id, user.id, Date.now())
    .first<{ liked: number }>()

  if (!inserted) {
    await c.env.DB.prepare('DELETE FROM likes WHERE post_id = ?1 AND user_id = ?2')
      .bind(id, user.id)
      .run()
  }

  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM likes WHERE post_id = ?1')
    .bind(id)
    .first<{ n: number }>()
  const result: LikeResult = { likeCount: count?.n ?? 0, likedByMe: Boolean(inserted) }
  return c.json(result)
})

export default posts
