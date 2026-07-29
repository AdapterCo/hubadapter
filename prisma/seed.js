const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  const hashedPassword = await bcrypt.hash('Brasil211709..', 12)
  const adminEmail = 'brennandinc@gmail.com'

  const admin = await prisma.client.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash: hashedPassword,
      role: 'ADMIN',
      active: true,
    },
    create: {
      name: 'Admin AdapterHub',
      email: adminEmail,
      passwordHash: hashedPassword,
      role: 'ADMIN',
      active: true,
      webhookToken: 'admin-no-webhook-' + Date.now(),
    },
  })

  console.log('✅ Admin verificado e atualizado:', admin.email)

  const devices = [
    'ADP-001', 'ADP-002', 'ADP-003', 'ADP-004', 'ADP-005',
    'ADP-006', 'ADP-007', 'ADP-008', 'ADP-009', 'ADP-010',
  ]

  for (const idmaq of devices) {
    await prisma.device.upsert({
      where: { idmaq },
      update: {},
      create: { idmaq },
    })
  }

  console.log('✅ Dispositivos pré-cadastrados:', devices.length)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
