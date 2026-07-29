import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const retentionDays = Number.parseInt(process.env.TELEMETRY_RETENTION_DAYS || '60', 10)
  if (!Number.isFinite(retentionDays) || retentionDays < 1) {
    throw new Error('TELEMETRY_RETENTION_DAYS must be a positive integer')
  }

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
  const result = await prisma.telemetryEvent.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      type: { not: 'payment' },
    },
  })
  console.log(`Removed ${result.count} telemetry events older than ${retentionDays} days`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
