import path from 'node:path'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

// Tests run inside workerd against a real (local) D1 built from the same
// migrations production uses, so schema mistakes surface here.
export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      singleWorker: true,
      isolatedStorage: true,
      miniflare: {
        compatibilityDate: '2025-09-01',
        compatibilityFlags: ['nodejs_compat'],
        d1Databases: { DB: 'chirp-db' },
        bindings: {
          APP_ORIGIN: 'http://localhost',
          MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, 'migrations')),
        },
      },
    })),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/applyMigrations.ts'],
  },
})
