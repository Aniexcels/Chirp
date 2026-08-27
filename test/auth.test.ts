import { env } from 'cloudflare:test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiError, AuthenticatedUser, SessionResponse } from '../shared/types'
import { createClient, json, post, resetDatabase, signUp } from './helpers'

const PASSWORD = 'correct horse battery'

/** Reads the token out of the link the mailer logs instead of sending. */
type ConsoleSpy = { mock: { calls: unknown[][] } }

const captureEmailToken = (spy: ConsoleSpy): string => {
  const bodies = spy.mock.calls.map((call) => String(call[0]))
  const match = bodies.join('\n').match(/token=([^\s"\\]+)/)
  if (!match) throw new Error(`no email token logged in: ${bodies.join('\n')}`)
  return decodeURIComponent(match[1])
}

beforeEach(() => resetDatabase())
afterEach(() => vi.restoreAllMocks())

describe('registration', () => {
  it('creates an account, returns no secrets and sets an HttpOnly cookie', async () => {
    const client = createClient()
    const res = await post(client, '/api/auth/register', { username: 'ada', password: PASSWORD })

    expect(res.status).toBe(201)
    const body = await json<SessionResponse>(res)
    expect(body.user).toMatchObject({ username: 'ada', displayName: 'ada', status: 'active' })
    expect(JSON.stringify(body.user)).not.toContain('pbkdf2')
    expect(res.headers.getAll('Set-Cookie')[0]).toMatch(/HttpOnly/i)
    expect(client.cookies.has('chirp_session')).toBe(true)

    const stored = await env.DB.prepare('SELECT password_hash FROM users WHERE username = ?1')
      .bind('ada')
      .first<{ password_hash: string }>()
    expect(stored?.password_hash).toMatch(/^pbkdf2\$/)
    expect(stored?.password_hash).not.toContain(PASSWORD)
  })

  it('normalizes the handle and rejects duplicates', async () => {
    await signUp('ada')
    const res = await post(createClient(), '/api/auth/register', {
      username: 'ADA',
      password: PASSWORD,
    })
    expect(res.status).toBe(409)
    expect((await json<ApiError>(res)).code).toBe('conflict')
  })

  it.each([
    ['short handle', { username: 'ab', password: PASSWORD }],
    ['illegal handle', { username: 'not a handle', password: PASSWORD }],
    ['short password', { username: 'ada', password: 'short' }],
    ['bad email', { username: 'ada', password: PASSWORD, email: 'nope' }],
    ['missing password', { username: 'ada' }],
  ])('rejects %s', async (_label, payload) => {
    const res = await post(createClient(), '/api/auth/register', payload)
    expect(res.status).toBe(400)
    expect((await json<ApiError>(res)).code).toBe('validation_error')
  })

  it('lets an account claim a legacy handle and keeps its posts', async () => {
    const now = Date.now()
    await env.DB.prepare(
      `INSERT INTO users (id, username, display_name, bio, created_at, updated_at)
       VALUES ('legacy-id', 'oldtimer', 'oldtimer', '', ?1, ?1)`,
    )
      .bind(now)
      .run()
    await env.DB.prepare(
      `INSERT INTO posts (id, author_id, body, created_at, updated_at)
       VALUES ('legacy-post', 'legacy-id', 'from before auth', ?1, ?1)`,
    )
      .bind(now)
      .run()

    const client = await signUp('oldtimer')
    const me = await json<AuthenticatedUser>(await client.fetch('/api/auth/me'))
    expect(me.id).toBe('legacy-id')

    const feed = await json<{ id: string }[]>(await client.fetch('/api/posts?author=oldtimer'))
    expect(feed.map((p) => p.id)).toContain('legacy-post')
  })

  it('refuses to claim a handle that already has credentials', async () => {
    await signUp('ada')
    const res = await post(createClient(), '/api/auth/register', {
      username: 'ada',
      password: 'a different password',
    })
    expect(res.status).toBe(409)
  })
})

describe('login and sessions', () => {
  it('signs in with the right password and rejects the wrong one', async () => {
    await signUp('ada')

    const bad = await post(createClient(), '/api/auth/login', {
      username: 'ada',
      password: 'wrong password',
    })
    expect(bad.status).toBe(401)
    // The message must not distinguish unknown handle from wrong password.
    expect((await json<ApiError>(bad)).error).toBe('incorrect handle or password')

    const unknown = await post(createClient(), '/api/auth/login', {
      username: 'nobody',
      password: PASSWORD,
    })
    expect(unknown.status).toBe(401)
    expect((await json<ApiError>(unknown)).error).toBe('incorrect handle or password')

    const client = createClient()
    const good = await post(client, '/api/auth/login', { username: 'ada', password: PASSWORD })
    expect(good.status).toBe(200)
    expect((await client.fetch('/api/auth/me')).status).toBe(200)
  })

  it('accepts a bearer token for clients without cookies', async () => {
    const client = await signUp('ada')
    const session = await json<SessionResponse>(
      await post(createClient(), '/api/auth/login', { username: 'ada', password: PASSWORD }),
    )
    client.cookies.clear()

    expect((await client.fetch('/api/auth/me')).status).toBe(401)
    const res = await client.fetch('/api/auth/me', {
      headers: { authorization: `Bearer ${session.token}` },
    })
    expect(res.status).toBe(200)
  })

  it('stores only a hash of the session token', async () => {
    const session = await json<SessionResponse>(
      await post(createClient(), '/api/auth/register', { username: 'ada', password: PASSWORD }),
    )
    const rows = await env.DB.prepare('SELECT id FROM sessions').all<{ id: string }>()
    expect(rows.results).toHaveLength(1)
    expect(rows.results[0].id).not.toBe(session.token)
  })

  it('rejects requests with a forged or revoked session', async () => {
    const client = await signUp('ada')
    expect((await client.fetch('/api/auth/me')).status).toBe(200)

    expect((await post(client, '/api/auth/logout')).status).toBe(204)
    expect(client.cookies.has('chirp_session')).toBe(false)
    expect((await client.fetch('/api/auth/me')).status).toBe(401)

    const forged = createClient()
    forged.cookies.set('chirp_session', 'not-a-real-token')
    expect((await forged.fetch('/api/auth/me')).status).toBe(401)
  })

  it('refuses expired sessions', async () => {
    const client = await signUp('ada')
    await env.DB.prepare('UPDATE sessions SET expires_at = ?1').bind(Date.now() - 1).run()
    expect((await client.fetch('/api/auth/me')).status).toBe(401)
  })

  it('locks out suspended accounts', async () => {
    const client = await signUp('ada')
    await env.DB.prepare("UPDATE users SET status = 'suspended' WHERE username = 'ada'").run()

    expect((await client.fetch('/api/auth/me')).status).toBe(401)
    const res = await post(createClient(), '/api/auth/login', {
      username: 'ada',
      password: PASSWORD,
    })
    expect(res.status).toBe(401)
    expect((await json<ApiError>(res)).error).toBe('this account is not active')
  })

  it('rate limits repeated failed logins', async () => {
    await signUp('ada')
    const client = createClient()
    const attempt = () => post(client, '/api/auth/login', { username: 'ada', password: 'nope' })

    let status = 401
    for (let i = 0; i < 12 && status === 401; i += 1) status = (await attempt()).status
    expect(status).toBe(429)

    const limited = await attempt()
    expect(limited.headers.get('retry-after')).toMatch(/^\d+$/)
    // Even the correct password is refused while the window is exhausted.
    expect((await post(client, '/api/auth/login', { username: 'ada', password: PASSWORD })).status).toBe(429)
  })
})

describe('password reset', () => {
  it('resets the password, revokes sessions and consumes the token once', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const client = await signUp('ada', PASSWORD, { email: 'ada@example.com' })
    spy.mockClear()

    const requested = await post(client, '/api/auth/password-reset/request', { username: 'ada' })
    expect(requested.status).toBe(202)
    const token = captureEmailToken(spy)

    const confirmed = await post(createClient(), '/api/auth/password-reset/confirm', {
      token,
      password: 'a brand new password',
    })
    expect(confirmed.status).toBe(204)

    // The session that existed before the reset is gone.
    expect((await client.fetch('/api/auth/me')).status).toBe(401)
    expect(
      (await post(createClient(), '/api/auth/login', { username: 'ada', password: PASSWORD }))
        .status,
    ).toBe(401)
    expect(
      (
        await post(createClient(), '/api/auth/login', {
          username: 'ada',
          password: 'a brand new password',
        })
      ).status,
    ).toBe(200)

    const replay = await post(createClient(), '/api/auth/password-reset/confirm', {
      token,
      password: 'yet another password',
    })
    expect(replay.status).toBe(400)
  })

  it('answers 202 for unknown handles without sending anything', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const res = await post(createClient(), '/api/auth/password-reset/request', {
      username: 'nobody',
    })
    expect(res.status).toBe(202)
    expect(spy).not.toHaveBeenCalled()
  })

  it('rejects an expired reset token', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const client = await signUp('ada', PASSWORD, { email: 'ada@example.com' })
    spy.mockClear()
    await post(client, '/api/auth/password-reset/request', { username: 'ada' })
    const token = captureEmailToken(spy)
    await env.DB.prepare("UPDATE auth_tokens SET expires_at = ?1 WHERE kind = 'password_reset'")
      .bind(Date.now() - 1)
      .run()

    const res = await post(createClient(), '/api/auth/password-reset/confirm', {
      token,
      password: 'a brand new password',
    })
    expect(res.status).toBe(400)
  })
})

describe('email verification', () => {
  it('marks the address verified exactly once', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const client = await signUp('ada', PASSWORD, { email: 'ada@example.com' })
    const token = captureEmailToken(spy)

    const before = await json<AuthenticatedUser>(await client.fetch('/api/auth/me'))
    expect(before.emailVerified).toBe(false)

    const verified = await json<AuthenticatedUser>(
      await post(client, '/api/auth/verify-email', { token }),
    )
    expect(verified.emailVerified).toBe(true)

    expect((await post(client, '/api/auth/verify-email', { token })).status).toBe(400)
  })
})

describe('request handling', () => {
  it.each([
    ['invalid json', 'not json at all'],
    ['a bare number', '42'],
    ['an array', '[]'],
  ])('answers a structured 400 for %s', async (_label, body) => {
    const res = await createClient().fetch('/api/auth/login', { method: 'POST', body })
    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toContain('application/json')
    const payload = await json<ApiError>(res)
    expect(payload.code).toBe('validation_error')
    expect(payload.error).not.toMatch(/at position|SyntaxError|D1_/)
  })

  it('blocks cross-origin cookie writes', async () => {
    const client = await signUp('ada')
    const res = await client.fetch('/api/posts', {
      method: 'POST',
      body: JSON.stringify({ body: 'from an evil page' }),
      headers: { origin: 'https://evil.example' },
    })
    expect(res.status).toBe(403)
  })

  it('answers unknown api routes with json', async () => {
    const res = await createClient().fetch('/api/nope')
    expect(res.status).toBe(404)
    expect((await json<ApiError>(res)).code).toBe('not_found')
  })
})
