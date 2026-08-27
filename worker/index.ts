import { Hono } from 'hono'
import type { AppEnv } from './env'
import { HttpError, badRequest, forbidden } from './errors'
import { readSessionToken, resolveSession } from './session'
import authRoutes from './routes/auth'
import postRoutes from './routes/posts'

const app = new Hono<AppEnv>()

app.use('/api/*', async (c, next) => {
  c.set('requestId', crypto.randomUUID())

  // Cookie-authenticated writes need CSRF protection: same-origin requests
  // either omit Origin or send our own. `Authorization`-bearing clients are
  // not cookie-driven and are exempt.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && !c.req.header('authorization')) {
    const origin = c.req.header('origin')
    if (origin && origin !== new URL(c.req.url).origin) {
      throw forbidden('cross-origin request blocked')
    }
  }

  const token = readSessionToken(c)
  const session = token ? await resolveSession(c.env, token) : null
  c.set('user', session?.user ?? null)
  c.set('sessionId', session?.sessionId ?? null)
  await next()
})

app.route('/api/auth', authRoutes)
app.route('/api/posts', postRoutes)

app.notFound((c) =>
  c.req.path.startsWith('/api/')
    ? c.json({ code: 'not_found', error: 'not found' }, 404)
    : c.env.ASSETS.fetch(c.req.raw),
)

/**
 * The single place an error becomes a response. Expected failures keep their
 * `ApiError` envelope; anything else is logged with the request id and
 * answered with a generic 500 so internals never reach a client.
 */
app.onError((error, c) => {
  const httpError =
    error instanceof HttpError
      ? error
      : error instanceof SyntaxError
        ? badRequest('request body must be valid JSON')
        : null

  if (httpError) {
    const headers: Record<string, string> = {}
    if (httpError.retryAfter) headers['retry-after'] = String(httpError.retryAfter)
    return c.json(httpError.toJSON(), httpError.status, headers)
  }

  console.error(
    JSON.stringify({
      event: 'request.unhandled_error',
      requestId: c.get('requestId'),
      path: c.req.path,
      method: c.req.method,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }),
  )
  return c.json({ code: 'internal_error', error: 'something went wrong' }, 500)
})

export default app
