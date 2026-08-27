import { afterEach, describe, expect, it, vi } from 'vitest'
import { timeAgo } from './timeAgo'

describe('timeAgo', () => {
  const now = new Date('2025-01-15T12:00:00Z').getTime()

  afterEach(() => vi.useRealTimers())

  it.each([
    [-59, '59s ago'],
    [-60, '1m ago'],
    [-60 * 60, '1h ago'],
    [-60 * 60 * 24, 'yesterday'],
    [-60 * 60 * 24 * 7, 'last wk.'],
    [-60 * 60 * 24 * 31, 'last mo.'],
    [-60 * 60 * 24 * 400, 'last yr.'],
    [59, 'in 59s'],
    [60, 'in 1m'],
    [60 * 60, 'in 1h'],
    [60 * 60 * 24, 'tomorrow'],
    [60 * 60 * 24 * 7, 'next wk.'],
    [60 * 60 * 24 * 31, 'next mo.'],
    [60 * 60 * 24 * 400, 'next yr.'],
  ])('formats %s seconds as %s', (seconds, expected) => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    expect(timeAgo(now + seconds * 1000)).toBe(expected)
  })
})
