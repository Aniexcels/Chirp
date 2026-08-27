import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { AppEnv, Env } from './env'
import { generateToken, hashToken } from './crypto'
import { USER_COLUMNS, toAuthenticatedUser } from './users'
import type { UserRow } from './users'
import { unauthenticated } from './errors'
import type { AuthenticatedUser } from '../shared/types'

export const SESSION_COOKIE = 'chirp_session'
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** Sliding expiry: an active session is extended at most once an hour. */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000

export interface IssuedSession {
  token: string
  expiresAt: number
}

export const createSession = async (
  env: Env,
  userId: string,
  userAgent: string | null,
  now = Date.now(),
): Promise<IssuedSession> => {
  const token = generateToken()
  const expiresAt = now + SESSION_TTL_MS
  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at, user_agent)
     VALUES (?1, ?2, ?3, ?3, ?4, ?5)`,
  )
    .bind(await hashToken(token), userId, now, expiresAt, userAgent?.slice(0, 200) ?? null)
    .run()
  return { token, expiresAt }
}

export const revokeSession = async (env: Env, sessionId: string): Promise<void> => {
  await env.DB.prepare('UPDATE sessions SET revoked_at = ?2 WHERE id = ?1 AND revoked_at IS NULL')
    .bind(sessionId, Date.now())
    .run()
}

/** Used after a password change so stolen credentials cannot keep a session. */
export const revokeAllSessions = async (
  env: Env,
  userId: string,
  exceptSessionId?: string,
): Promise<void> => {
  await env.DB.prepare(
    `UPDATE sessions SET revoked_at = ?2
     WHERE user_id = ?1 AND revoked_at IS NULL AND id IS NOT ?3`,
  )
    .bind(userId, Date.now(), exceptSessionId ?? null)
    .run()
}

interface ResolvedSession {
  sessionId: string
  user: AuthenticatedUser
}

/**
 * Resolves the identity of a request server-side. The token comes from an
 * HttpOnly cookie (browsers) or an `Authorization: Bearer` header (native
 * clients); nothing the client asserts about *who* it is, is trusted.
 */
export const resolveSession = async (
  env: Env,
  token: string,
  now = Date.now(),
): Promise<ResolvedSession | null> => {
  const sessionId = await hashToken(token)
  const row = await env.DB.prepare(
    `SELECT s.id AS session_id, s.last_seen_at, ${USER_COLUMNS.split(', ')
      .map((column) => `u.${column}`)
      .join(', ')}
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ?1 AND s.revoked_at IS NULL AND s.expires_at > ?2`,
  )
    .bind(sessionId, now)
    .first<UserRow & { session_id: string; last_seen_at: number }>()

  if (!row) return null
  // A suspended or deactivated account cannot use an existing session either;
  // 401 (not 403) so clients fall back to the sign-in screen.
  if (row.status !== 'active') throw unauthenticated('this account is not active')

  if (now - row.last_seen_at > TOUCH_INTERVAL_MS) {
    await env.DB.prepare('UPDATE sessions SET last_seen_at = ?2, expires_at = ?3 WHERE id = ?1')
      .bind(sessionId, now, now + SESSION_TTL_MS)
      .run()
  }

  return { sessionId, user: toAuthenticatedUser(row) }
}

export const readSessionToken = (c: Context<AppEnv>): string | null => {
  const header = c.req.header('authorization')
  if (header?.toLowerCase().startsWith('bearer ')) return header.slice(7).trim() || null
  return getCookie(c, SESSION_COOKIE) ?? null
}

export const setSessionCookie = (c: Context<AppEnv>, token: string, expiresAt: number): void => {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: new URL(c.req.url).protocol === 'https:',
    path: '/',
    maxAge: Math.floor((expiresAt - Date.now()) / 1000),
  })
}

export const clearSessionCookie = (c: Context<AppEnv>): void => {
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
}

/** Guard for every authenticated route; throws instead of returning null. */
export const requireUser = (c: Context<AppEnv>): AuthenticatedUser => {
  const user = c.get('user')
  if (!user) throw unauthenticated()
  return user
}
