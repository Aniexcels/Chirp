import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'
import type { Post, CreatePostBody } from '../shared/types'
import { MAX_POST_LENGTH, USERNAME_PATTERN, USER_HEADER } from '../shared/types'

interface Env {
  DB: D1Database
  ASSETS: Fetcher
}

interface PostRow {
  id: string
  author: string
  body: string
  parent_id: string | null
  created_at: number
  like_count: number
  reply_count: number
  liked_by_me: number
}

const toPost = (row: PostRow): Post => ({
  id: row.id,
  author: row.author,
  body: row.body,
  parentId: row.parent_id,
  createdAt: row.created_at,
  likeCount: row.like_count,
  replyCount: row.reply_count,
  likedByMe: row.liked_by_me === 1,
})

const POST_SELECT = `
  SELECT p.id, p.author, p.body, p.parent_id, p.created_at,
         (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count,
         (SELECT COUNT(*) FROM posts r WHERE r.parent_id = p.id) AS reply_count,
         EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.username = ?1) AS liked_by_me
  FROM posts p
`

type AppEnv = { Bindings: Env; Variables: { user: string | null; authedUser: string } }

const app = new Hono<AppEnv>()

app.use('/api/*', async (c, next) => {
  const raw = c.req.header(USER_HEADER)?.trim().toLowerCase() ?? ''
  c.set('user', USERNAME_PATTERN.test(raw) ? raw : null)
  await next()
})

const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user')
  if (!user) return c.json({ error: 'pick a username first' }, 401)
  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO users (username, created_at) VALUES (?1, ?2)',
  )
    .bind(user, Date.now())
    .run()
  c.set('authedUser', user)
  await next()
}

const postExists = async (db: D1Database, id: string): Promise<boolean> =>
  Boolean(await db.prepare('SELECT id FROM posts WHERE id = ?1').bind(id).first())

app.get('/api/posts', async (c) => {
  const user = c.get('user') ?? ''
  const author = c.req.query('author')
  const where = author ? 'WHERE p.parent_id IS NULL AND p.author = ?2' : 'WHERE p.parent_id IS NULL'
  const stmt = c.env.DB.prepare(`${POST_SELECT} ${where} ORDER BY p.created_at DESC LIMIT 50`)
  const { results } = await (author ? stmt.bind(user, author) : stmt.bind(user)).all<PostRow>()
  return c.json(results.map(toPost))
})

app.get('/api/posts/:id', async (c) => {
  const user = c.get('user') ?? ''
  const id = c.req.param('id')
  const post = await c.env.DB.prepare(`${POST_SELECT} WHERE p.id = ?2`)
    .bind(user, id)
    .first<PostRow>()
  if (!post) return c.json({ error: 'post not found' }, 404)
  const { results } = await c.env.DB.prepare(
    `${POST_SELECT} WHERE p.parent_id = ?2 ORDER BY p.created_at ASC LIMIT 100`,
  )
    .bind(user, id)
    .all<PostRow>()
  return c.json({ post: toPost(post), replies: results.map(toPost) })
})

app.post('/api/posts', requireUser, async (c) => {
  const user = c.get('authedUser')

  const { body, parentId = null } = await c.req.json<CreatePostBody>()
  const text = body?.trim() ?? ''
  if (!text) return c.json({ error: 'post cannot be empty' }, 400)
  if (text.length > MAX_POST_LENGTH) {
    return c.json({ error: `post must be ${MAX_POST_LENGTH} characters or fewer` }, 400)
  }
  if (parentId && !(await postExists(c.env.DB, parentId))) {
    return c.json({ error: 'parent post not found' }, 404)
  }

  const id = crypto.randomUUID()
  const createdAt = Date.now()
  await c.env.DB.prepare(
    'INSERT INTO posts (id, author, body, parent_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5)',
  )
    .bind(id, user, text, parentId, createdAt)
    .run()

  const post: Post = {
    id,
    author: user,
    body: text,
    parentId,
    createdAt,
    likeCount: 0,
    replyCount: 0,
    likedByMe: false,
  }
  return c.json(post, 201)
})

app.delete('/api/posts/:id', requireUser, async (c) => {
  const user = c.get('authedUser')
  const result = await c.env.DB.prepare('DELETE FROM posts WHERE id = ?1 AND author = ?2')
    .bind(c.req.param('id'), user)
    .run()
  if (!result.meta.changes) return c.json({ error: 'post not found' }, 404)
  return c.body(null, 204)
})

app.post('/api/posts/:id/like', requireUser, async (c) => {
  const user = c.get('authedUser')
  const id = c.req.param('id')
  if (!(await postExists(c.env.DB, id))) return c.json({ error: 'post not found' }, 404)

  const existing = await c.env.DB.prepare(
    'SELECT 1 FROM likes WHERE post_id = ?1 AND username = ?2',
  )
    .bind(id, user)
    .first()

  if (existing) {
    await c.env.DB.prepare('DELETE FROM likes WHERE post_id = ?1 AND username = ?2')
      .bind(id, user)
      .run()
  } else {
    await c.env.DB.prepare(
      'INSERT INTO likes (post_id, username, created_at) VALUES (?1, ?2, ?3)',
    )
      .bind(id, user, Date.now())
      .run()
  }

  const count = await c.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM likes WHERE post_id = ?1',
  )
    .bind(id)
    .first<{ n: number }>()
  return c.json({ likeCount: count?.n ?? 0, likedByMe: !existing })
})

app.notFound((c) =>
  c.req.path.startsWith('/api/')
    ? c.json({ error: 'not found' }, 404)
    : c.env.ASSETS.fetch(c.req.raw),
)

export default app
