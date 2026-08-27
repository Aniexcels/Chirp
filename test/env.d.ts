/// <reference types="@cloudflare/vitest-pool-workers/types" />

import type { D1Migration } from '@cloudflare/vitest-pool-workers'

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database
      APP_ORIGIN: string
      /** Migrations read in Node and applied to the test database on setup. */
      MIGRATIONS: D1Migration[]
    }
  }
}
