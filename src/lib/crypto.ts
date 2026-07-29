import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'crypto'

const ENCRYPTED_PREFIX = 'enc:v1'

function encryptionKey(): Buffer {
  const value = process.env.APP_ENCRYPTION_KEY
  if (!value) throw new Error('APP_ENCRYPTION_KEY is required')

  const key = /^[0-9a-f]{64}$/i.test(value)
    ? Buffer.from(value, 'hex')
    : Buffer.from(value, 'base64')

  if (key.length !== 32) {
    throw new Error('APP_ENCRYPTION_KEY must be 32 bytes encoded as hex or base64')
  }

  return key
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [ENCRYPTED_PREFIX, iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':')
}

export function decryptSecret(value: string | null | undefined): string | null {
  if (!value) return null
  if (!value.startsWith(`${ENCRYPTED_PREFIX}:`)) {
    throw new Error('Stored secret is not encrypted')
  }

  const [, , ivValue, tagValue, encryptedValue] = value.split(':')
  if (!ivValue || !tagValue || !encryptedValue) throw new Error('Invalid encrypted secret')

  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64'))
  decipher.setAuthTag(Buffer.from(tagValue, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

export function hashSecret(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function secretsEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function signCommand(secret: string, action: string, amount: string, paymentId: string): string {
  return createHmac('sha256', secret)
    .update(`${action}|${amount}|${paymentId}`)
    .digest('hex')
}

export function generateDeviceSecret(): string {
  return randomBytes(32).toString('base64url')
}
