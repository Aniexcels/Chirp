import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import app from '../worker/index'
import type { Env } from '../worker/env'

const workerEnv: Env = {
  DB: env.DB,
  APP_ORIGIN: env.APP_ORIGIN,
  ASSETS: { fetch: async () => new Response('asset', { status: 200 }) },
}

export interface Client {
  /** Cookies the server has set, replayed on later requests like a browser. */
  cookies: Map<string, string>
  fetch: (path: string, init?: RequestInit) => Promise<Response>
}

export const createClient = (): Client => {
  const cookies = new Map<string, string>()

  const fetchApi = async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers)
    if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
    if (cookies.size) {
      headers.set(
        'cookie',
        [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
      )
    }

    const ctx = createExecutionContext()
    const res = await app.fetch(
      new Request(`http://localhost${path}`, { ...init, headers }),
      workerEnv,
      ctx,
    )
    await waitOnExecutionContext(ctx)

    for (const value of res.headers.getAll('Set-Cookie')) {
      const [pair, ...attributes] = value.split(';')
      const separator = pair.indexOf('=')
      const name = pair.slice(0, separator).trim()
      const expired = attributes.some((attribute) => /max-age=0/i.test(attribute.trim()))
      if (expired) cookies.delete(name)
      else cookies.set(name, pair.slice(separator + 1).trim())
    }
    return res
  }

  return { cookies, fetch: fetchApi }
}

export const json = async <T>(res: Response): Promise<T> => (await res.json()) as T

export const post = (client: Client, path: string, body?: unknown) =>
  client.fetch(path, { method: 'POST', body: body === undefined ? '{}' : JSON.stringify(body) })

/** Registers a fresh account and returns a client already carrying its session. */
export const signUp = async (
  username: string,
  password = 'correct horse battery',
  extra: Record<string, unknown> = {},
) => {
  const client = createClient()
  const res = await post(client, '/api/auth/register', { username, password, ...extra })
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${await res.text()}`)
  return client
}

/** Every test starts from an empty database rather than inheriting rows. */
export const resetDatabase = () =>
  env.DB.batch(
    ['likes', 'posts', 'auth_tokens', 'sessions', 'users', 'rate_limits'].map((table) =>
      env.DB.prepare(`DELETE FROM ${table}`),
    ),
  )
