import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required to run the production seed`)
  return value
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

    await prisma.device.create({
      data: { idmaq },
    })
    console.log(`Provisioned ${idmaq}`)
  }

  console.log(`Admin account ready: ${adminEmail}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
