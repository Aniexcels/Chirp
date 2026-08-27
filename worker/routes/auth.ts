import { Hono } from 'hono'
import type { AppEnv, Env } from '../env'
import { conflict, badRequest, unauthenticated } from '../errors'
import { generateToken, hashPassword, hashToken, verifyPassword } from '../crypto'
import { LIMITS, clientIp, enforceRateLimit, resetRateLimit } from '../rateLimit'
import { sendEmailVerificationEmail, sendPasswordResetEmail } from '../mailer'
import {
  clearSessionCookie,
  createSession,
  requireUser,
  revokeAllSessions,
  revokeSession,
  setSessionCookie,
} from '../session'
import {
  findUserById,
  findUserByUsername,
  isClaimableLegacyAccount,
  toAuthenticatedUser,
} from '../users'
import {
  parseLoginBody,
  parsePasswordResetBody,
  parsePasswordResetRequestBody,
  parseRegisterBody,
  parseVerifyEmailBody,
} from '../validate'
import type { SessionResponse } from '../../shared/types'

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000

/** A dummy verification keeps login timing similar for unknown handles. */
const DUMMY_HASH =
  'pbkdf2$210000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

const issueAuthToken = async (
  env: Env,
  userId: string,
  kind: 'password_reset' | 'email_verification',
  ttlMs: number,
  now = Date.now(),
): Promise<string> => {
  const token = generateToken()
  await env.DB.batch([
    // A new token invalidates the previous unused one of the same kind.
    env.DB.prepare(
      `UPDATE auth_tokens SET consumed_at = ?3
       WHERE user_id = ?1 AND kind = ?2 AND consumed_at IS NULL`,
    ).bind(userId, kind, now),
    env.DB.prepare(
      `INSERT INTO auth_tokens (id, user_id, kind, created_at, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5)`,
    ).bind(await hashToken(token), userId, kind, now, now + ttlMs),
  ])
  return token
}

/** Consumes a token atomically so it can never be replayed. */
const consumeAuthToken = async (
  env: Env,
  token: string,
  kind: 'password_reset' | 'email_verification',
  now = Date.now(),
): Promise<string> => {
  const row = await env.DB.prepare(
    `UPDATE auth_tokens SET consumed_at = ?3
     WHERE id = ?1 AND kind = ?2 AND consumed_at IS NULL AND expires_at > ?3
     RETURNING user_id`,
  )
    .bind(await hashToken(token), kind, now)
    .first<{ user_id: string }>()
  if (!row) throw badRequest('this link is invalid or has expired', { token: 'invalid' })
  return row.user_id
}

const auth = new Hono<AppEnv>()

auth.post('/register', async (c) => {
  const ip = clientIp(c.req.raw)
  await enforceRateLimit(c.env, `register:${ip}`, LIMITS.register)

  const { username, password, email, displayName } = parseRegisterBody(await c.req.json())
  const now = Date.now()
  const passwordHash = await hashPassword(password)
  const existing = await findUserByUsername(c.env, username)

  let userId: string
  if (existing) {
    // Handles created before authentication existed can be claimed, which
    // keeps their posts and likes attached to the new account.
    if (!isClaimableLegacyAccount(existing)) {
      throw conflict('that handle is taken', { username: 'taken' })
    }
    userId = existing.id
    await c.env.DB.prepare(
      `UPDATE users SET password_hash = ?2, email = ?3, display_name = ?4, updated_at = ?5
       WHERE id = ?1 AND password_hash IS NULL`,
    )
      .bind(userId, passwordHash, email, displayName, now)
      .run()
  } else {
    userId = crypto.randomUUID()
    try {
      await c.env.DB.prepare(
        `INSERT INTO users (id, username, display_name, email, password_hash, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)`,
      )
        .bind(userId, username, displayName, email, passwordHash, now)
        .run()
    } catch (error) {
      // The unique indexes are the source of truth, not the lookup above.
      if (error instanceof Error && /UNIQUE/i.test(error.message)) {
        throw conflict('that handle or email is already registered')
      }
      throw error
    }
  }

  if (email) {
    const token = await issueAuthToken(
      c.env,
      userId,
      'email_verification',
      EMAIL_VERIFICATION_TTL_MS,
      now,
    )
    await sendEmailVerificationEmail(c.env, c.req.raw, email, token)
  }

  const row = await findUserById(c.env, userId)
  if (!row) throw new Error('user disappeared during registration')
  const session = await createSession(c.env, userId, c.req.header('user-agent') ?? null, now)
  setSessionCookie(c, session.token, session.expiresAt)
  const response: SessionResponse = {
    user: toAuthenticatedUser(row),
    token: session.token,
    expiresAt: session.expiresAt,
  }
  return c.json(response, 201)
})

auth.post('/login', async (c) => {
  const ip = clientIp(c.req.raw)
  const { username, password } = parseLoginBody(await c.req.json())
  // Per-handle and per-IP buckets: neither a targeted nor a spray attack wins.
  await enforceRateLimit(c.env, `login:ip:${ip}`, LIMITS.login)
  await enforceRateLimit(c.env, `login:user:${username}`, LIMITS.login)

  const row = await findUserByUsername(c.env, username)
  const valid = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH)
  if (!row || !row.password_hash || !valid) {
    throw unauthenticated('incorrect handle or password')
  }
  if (row.status !== 'active') throw unauthenticated('this account is not active')

  await resetRateLimit(c.env, `login:user:${username}`)
  const session = await createSession(c.env, row.id, c.req.header('user-agent') ?? null)
  setSessionCookie(c, session.token, session.expiresAt)
  const response: SessionResponse = {
    user: toAuthenticatedUser(row),
    token: session.token,
    expiresAt: session.expiresAt,
  }
  return c.json(response)
})

auth.post('/logout', async (c) => {
  const sessionId = c.get('sessionId')
  if (sessionId) await revokeSession(c.env, sessionId)
  clearSessionCookie(c)
  return c.body(null, 204)
})

auth.get('/me', (c) => c.json(requireUser(c)))

auth.post('/password-reset/request', async (c) => {
  const { username } = parsePasswordResetRequestBody(await c.req.json())
  await enforceRateLimit(c.env, `reset:${clientIp(c.req.raw)}`, LIMITS.passwordReset)

  const row = await findUserByUsername(c.env, username)
  if (row?.email) {
    const token = await issueAuthToken(c.env, row.id, 'password_reset', PASSWORD_RESET_TTL_MS)
    await sendPasswordResetEmail(c.env, c.req.raw, row.email, token)
  }
  // Always 202: the response must not reveal whether the handle exists.
  return c.body(null, 202)
})

auth.post('/password-reset/confirm', async (c) => {
  const { token, password } = parsePasswordResetBody(await c.req.json())
  await enforceRateLimit(c.env, `reset:${clientIp(c.req.raw)}`, LIMITS.passwordReset)

  const userId = await consumeAuthToken(c.env, token, 'password_reset')
  await c.env.DB.prepare('UPDATE users SET password_hash = ?2, updated_at = ?3 WHERE id = ?1')
    .bind(userId, await hashPassword(password), Date.now())
    .run()
  // Any session opened with the old password is no longer trusted.
  await revokeAllSessions(c.env, userId)
  clearSessionCookie(c)
  return c.body(null, 204)
})

auth.post('/verify-email', async (c) => {
  const { token } = parseVerifyEmailBody(await c.req.json())
  const userId = await consumeAuthToken(c.env, token, 'email_verification')
  const now = Date.now()
  await c.env.DB.prepare(
    'UPDATE users SET email_verified_at = ?2, updated_at = ?2 WHERE id = ?1 AND email_verified_at IS NULL',
  )
    .bind(userId, now)
    .run()
  const row = await findUserById(c.env, userId)
  if (!row) throw badRequest('this link is invalid or has expired', { token: 'invalid' })
  return c.json(toAuthenticatedUser(row))
})

export default auth
