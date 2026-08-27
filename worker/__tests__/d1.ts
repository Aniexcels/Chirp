import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { vi } from 'vitest'

const migration = readFileSync('migrations/0001_init.sql', 'utf8')

type Statement = {
  bind: (...params: unknown[]) => Statement
  all: <T>() => Promise<{ results: T[] }>
  first: <T>(columnName?: string) => Promise<T | null>
  run: () => Promise<{ meta: { changes: number } }>
}

export type TestEnv = {
  DB: D1Database
  ASSETS: Fetcher
}

export const createEnv = (assetResponse = new Response('asset')): TestEnv => {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(migration)
  const execute = (sql: string, params: unknown[]) => {
    if (/\?\d+/.test(sql)) {
      return Object.fromEntries(params.map((param, index) => [String(index + 1), param]))
    }
    return params
  }
  const env = {
    DB: {
      prepare(sql: string) {
        let params: unknown[] = []
        const statement: Statement = {
          bind(...bound) {
            params = bound
            return statement
          },
          async all<T>() {
            return { results: db.prepare(sql).all(execute(sql, params)) as T[] }
          },
          async first<T>() {
            const row = db.prepare(sql).get(execute(sql, params))
            return (row as T | undefined) ?? null
          },
          async run() {
            const result = db.prepare(sql).run(execute(sql, params))
            return { meta: { changes: Number(result.changes) } }
          },
        }
        return statement
      },
    } as D1Database,
    ASSETS: {
      fetch: vi.fn(async () => assetResponse),
    } as unknown as Fetcher,
  }
  return env
}
