import type { Env } from './env'
import { rateLimited } from './errors'

/**
 * Fixed-window counters in D1. Good enough to blunt brute force and API abuse
 * without new infrastructure; if a single window ever needs to be exact under
 * heavy contention, the same interface can move to a Durable Object.
 */
export const LIMITS = {
  login: { limit: 10, windowMs: 15 * 60_000 },
  register: { limit: 5, windowMs: 60 * 60_000 },
  passwordReset: { limit: 5, windowMs: 60 * 60_000 },
  createPost: { limit: 30, windowMs: 5 * 60_000 },
  like: { limit: 120, windowMs: 5 * 60_000 },
} as const

export const clientIp = (request: Request): string =>
  request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? 'unknown'

/** Increments the counter and throws a 429 (with Retry-After) once over limit. */
export const enforceRateLimit = async (
  env: Env,
  bucket: string,
  { limit, windowMs }: { limit: number; windowMs: number },
  now = Date.now(),
): Promise<void> => {
  const windowStart = now - (now % windowMs)
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (bucket, hits, window_start) VALUES (?1, 1, ?2)
     ON CONFLICT (bucket) DO UPDATE SET
       hits = CASE WHEN rate_limits.window_start = ?2 THEN rate_limits.hits + 1 ELSE 1 END,
       window_start = ?2
     RETURNING hits`,
  )
    .bind(bucket, windowStart)
    .first<{ hits: number }>()

  if ((row?.hits ?? 0) > limit) {
    throw rateLimited(Math.ceil((windowStart + windowMs - now) / 1000))
  }
}

/** Clears a counter after a legitimate success (e.g. a correct login). */
export const resetRateLimit = (env: Env, bucket: string): Promise<unknown> =>
  env.DB.prepare('DELETE FROM rate_limits WHERE bucket = ?1').bind(bucket).run()
