import type { AuthenticatedUser } from '../shared/types'

export interface Env {
  DB: D1Database
  /** Static asset binding. Only `fetch` is used, which keeps it stubbable in tests. */
  ASSETS: Pick<Fetcher, 'fetch'>
  /** Absolute origin used to build links in emails. Falls back to the request origin. */
  APP_ORIGIN?: string
}

export interface Variables {
  /** Set by the session middleware. Null for anonymous requests. */
  user: AuthenticatedUser | null
  sessionId: string | null
  requestId: string
}

export type AppEnv = { Bindings: Env; Variables: Variables }
