import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { createCipheriv, createHash, randomBytes } from 'crypto'

const prisma = new PrismaClient()

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required to run the production seed`)
  return value
}

function encryptionKey(): Buffer {
  const value = required('APP_ENCRYPTION_KEY')
  const key = /^[0-9a-f]{64}$/i.test(value)
    ? Buffer.from(value, 'hex')
    : Buffer.from(value, 'base64')
  if (key.length !== 32) throw new Error('APP_ENCRYPTION_KEY must contain exactly 32 bytes')
  return key
}

function encrypt(value: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [
    'enc:v1',
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    encrypted.toString('base64'),
  ].join(':')
}

async function main() {
  const adminEmail = required('ADMIN_EMAIL').toLowerCase()
  const adminPassword = required('ADMIN_PASSWORD')
  if (adminPassword.length < 12) throw new Error('ADMIN_PASSWORD must have at least 12 characters')

  const passwordHash = await bcrypt.hash(adminPassword, 12)
  await prisma.client.upsert({
    where: { email: adminEmail },
    update: {
      name: process.env.ADMIN_NAME?.trim() || 'Admin AdapterHub',
      passwordHash,
      role: 'ADMIN',
      active: true,
    },
    create: {
      name: process.env.ADMIN_NAME?.trim() || 'Admin AdapterHub',
      email: adminEmail,
      passwordHash,
      role: 'ADMIN',
      active: true,
    },
  })

  const deviceIds = (process.env.SEED_DEVICE_IDS || '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean)

  for (const idmaq of deviceIds) {
    const existing = await prisma.device.findUnique({ where: { idmaq } })
    if (existing) continue

    const apiKey = randomBytes(32).toString('base64url')
    await prisma.device.create({
      data: {
        idmaq,
        apiKeyHash: createHash('sha256').update(apiKey).digest('hex'),
        commandSecret: encrypt(apiKey),
      },
    })
    console.log(`Provisioned ${idmaq}. Store this one-time API key securely: ${apiKey}`)
  }

  console.log(`Admin account ready: ${adminEmail}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
