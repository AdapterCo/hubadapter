import { describe, expect, it } from 'vitest'
import { checkRateLimit } from './rate-limit'

describe('rate limit', () => {
  it('blocks requests above the configured threshold', () => {
    const key = `test-${crypto.randomUUID()}`
    expect(checkRateLimit(key, 2, 60_000).allowed).toBe(true)
    expect(checkRateLimit(key, 2, 60_000).allowed).toBe(true)
    expect(checkRateLimit(key, 2, 60_000).allowed).toBe(false)
  })
})
