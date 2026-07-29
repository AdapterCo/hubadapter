const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'brennandinc@gmail.com').trim().toLowerCase()
  const adminPassword = process.env.ADMIN_PASSWORD || 'Brasil211709..'

  const hashedPassword = await bcrypt.hash(adminPassword, 12)
  await prisma.client.upsert({
    where: { email: adminEmail },
    update: {
      name: process.env.ADMIN_NAME?.trim() || 'Admin AdapterHub',
      passwordHash: hashedPassword,
      role: 'ADMIN',
      active: true,
    },
    create: {
      name: process.env.ADMIN_NAME?.trim() || 'Admin AdapterHub',
      email: adminEmail,
      passwordHash: hashedPassword,
      role: 'ADMIN',
      active: true,
    },
  })

  const deviceIdsStr =
    process.env.SEED_DEVICE_IDS ||
    'ADP-001,ADP-002,ADP-003,ADP-004,ADP-005,ADP-006,ADP-007,ADP-008,ADP-009,ADP-010'
  const deviceIds = deviceIdsStr
    .split(',')
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean)

  for (const idmaq of deviceIds) {
    const existing = await prisma.device.findUnique({ where: { idmaq } })
    if (existing) continue

    await prisma.device.create({
      data: { idmaq },
    })
  }

  console.log(`✅ Seed concluído! Admin configurado: ${adminEmail}`)
}

main()
  .catch((error) => {
    console.error('[seed error]', error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
