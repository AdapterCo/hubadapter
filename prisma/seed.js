const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  const hashedPassword = await bcrypt.hash('Brasil211709..', 12)
  
  const admin = await prisma.client.upsert({
    where: { email: 'brennandinc@gmail.com' },
    update: {},
    create: {
      name: 'Admin AdapterHub',
      email: 'brennandinc@gmail.com',
      passwordHash: hashedPassword,
      role: 'ADMIN',
      webhookToken: 'admin-no-webhook-' + Date.now(),
    },
  })
  
  console.log('✅ Admin criado:', admin.email)

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
  console.log('\nSistema pronto!')
  console.log('Admin: brennandinc@gmail.com / Brasil211709..')
  console.log('Dispositivos disponíveis:', devices.join(', '))
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
