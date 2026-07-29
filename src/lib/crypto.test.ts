import { beforeEach, describe, expect, it } from 'vitest'
import {
  decryptSecret,
  encryptSecret,
  secretsEqual,
} from './crypto'

describe('secret protection', () => {
  beforeEach(() => {
    process.env.APP_ENCRYPTION_KEY = '11'.repeat(32)
  })

  it('encrypts with authenticated encryption and decrypts the original value', () => {
    const encrypted = encryptSecret('APP_USR-sensitive')
    expect(encrypted).not.toContain('APP_USR-sensitive')
    expect(decryptSecret(encrypted)).toBe('APP_USR-sensitive')
  })

  it('rejects modified ciphertext', () => {
    const encrypted = encryptSecret('secret')
    const modified = `${encrypted.slice(0, -2)}aa`
    expect(() => decryptSecret(modified)).toThrow()
  })

  it('compares secrets without exposing their contents', () => {
    expect(secretsEqual('same-value', 'same-value')).toBe(true)
    expect(secretsEqual('same-value', 'different')).toBe(false)
  })
})
